import {
  getPredictionTypeDescription,
  getPredictionTypeLabel,
  isNoScoreEpisode,
  predictionTypeHasPoints,
} from "@/lib/predictionTypes";

export type RoundModule = {
  id: string;
  round_id: string;
  prediction_type: string;
  title: string | null;
  sort_order: number;
  created_at: string;
};

export function buildFallbackRoundModule(round: {
  id: string;
  prediction_type: string;
}): RoundModule {
  return {
    id: `legacy-${round.id}`,
    round_id: round.id,
    prediction_type: round.prediction_type,
    title: null,
    sort_order: 1,
    created_at: new Date(0).toISOString(),
  };
}

export function sortRoundModules<T extends Pick<RoundModule, "sort_order" | "created_at" | "id">>(
  modules: T[]
) {
  return [...modules].sort((left, right) => {
    if (left.sort_order !== right.sort_order) {
      return left.sort_order - right.sort_order;
    }

    const leftCreated = new Date(left.created_at).getTime();
    const rightCreated = new Date(right.created_at).getTime();

    if (leftCreated !== rightCreated) {
      return leftCreated - rightCreated;
    }

    return left.id.localeCompare(right.id);
  });
}

export function getRoundModuleLabel(module: Pick<RoundModule, "prediction_type" | "title">) {
  return module.title?.trim() || getPredictionTypeLabel(module.prediction_type);
}

export function getRoundModuleDescription(module: Pick<RoundModule, "prediction_type">) {
  return getPredictionTypeDescription(module.prediction_type);
}

export function getRoundModuleSummary(modules: Array<Pick<RoundModule, "prediction_type" | "title">>) {
  if (modules.length === 0) {
    return "No prediction modules";
  }

  return modules.map((module) => getRoundModuleLabel(module)).join(" • ");
}

export function roundHasScoredModules(modules: Array<Pick<RoundModule, "prediction_type">>) {
  return modules.some((module) => predictionTypeHasPoints(module.prediction_type));
}

export function roundIsWatchOnly(modules: Array<Pick<RoundModule, "prediction_type">>) {
  return modules.length > 0 && modules.every((module) => isNoScoreEpisode(module.prediction_type));
}
