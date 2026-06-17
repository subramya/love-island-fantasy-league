import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isNoScoreEpisode,
  isQuestionChallengePrediction,
  isRecouplingPrediction,
} from "@/lib/predictionTypes";
import {
  getRoundModuleLabel,
  sortRoundModules,
  type RoundModule,
} from "@/lib/roundModules";

type CoupleRow = {
  contestant_1_id: string;
  contestant_2_id: string;
};

type PredictionRow = {
  bombshell_contestant_id?: string | null;
  contestant_1_id: string;
  contestant_2_id?: string | null;
  module_id?: string | null;
  prediction_role?: string | null;
  round_question_id?: string | null;
  user_id: string;
};

type RoundResultRow = {
  bombshell_contestant_id?: string | null;
  module_id?: string | null;
  round_question_id?: string | null;
  result_type: string;
  contestant_id: string | null;
  contestant_2_id?: string | null;
};

type ActualCoupleRow = CoupleRow & {
  module_id?: string | null;
};

type ScoreSummary = {
  user_id: string;
  points: number;
};

function normalizePair(firstId: string, secondId: string) {
  return [firstId, secondId].sort();
}

export function isExactCoupleMatch(prediction: CoupleRow, actualCouple: CoupleRow) {
  const [predictedA, predictedB] = normalizePair(
    prediction.contestant_1_id,
    prediction.contestant_2_id
  );
  const [actualA, actualB] = normalizePair(
    actualCouple.contestant_1_id,
    actualCouple.contestant_2_id
  );

  return predictedA === actualA && predictedB === actualB;
}

export function sharesOnePerson(prediction: CoupleRow, actualCouple: CoupleRow) {
  const predictionSet = new Set([prediction.contestant_1_id, prediction.contestant_2_id]);

  const overlapCount = [actualCouple.contestant_1_id, actualCouple.contestant_2_id].filter(
    (contestantId) => predictionSet.has(contestantId)
  ).length;

  return overlapCount === 1;
}

export function scoreCouplePrediction(prediction: CoupleRow, actualCouples: CoupleRow[]) {
  if (actualCouples.some((actualCouple) => isExactCoupleMatch(prediction, actualCouple))) {
    return 5;
  }

  if (actualCouples.some((actualCouple) => sharesOnePerson(prediction, actualCouple))) {
    return 2;
  }

  return 0;
}

function addPoints(totals: Map<string, number>, userId: string, points: number) {
  totals.set(userId, (totals.get(userId) ?? 0) + points);
}

export function calculateRecouplingScores(
  predictions: PredictionRow[],
  actualCouples: CoupleRow[]
) {
  const totals = new Map<string, number>();

  for (const prediction of predictions) {
    if (!prediction.contestant_2_id) {
      continue;
    }

    const points = scoreCouplePrediction(
      {
        contestant_1_id: prediction.contestant_1_id,
        contestant_2_id: prediction.contestant_2_id,
      },
      actualCouples
    );

    addPoints(totals, prediction.user_id, points);
  }

  return Array.from(totals.entries()).map(([user_id, points]) => ({ user_id, points }));
}

export function calculateEliminationScores(
  predictions: PredictionRow[],
  roundResults: RoundResultRow[]
) {
  const totals = new Map<string, number>();
  const dumpedResultId =
    roundResults.find((result) => result.result_type === "dumped_pick")?.contestant_id ?? null;
  const bottomGroupResultId =
    roundResults.find((result) => result.result_type === "bottom_group_pick")?.contestant_id ??
    null;
  const bottomGroupIsNoScore = roundResults.some(
    (result) => result.result_type === "bottom_group_pick_no_score"
  );

  for (const prediction of predictions) {
    if (prediction.prediction_role === "dumped_pick" && prediction.contestant_1_id === dumpedResultId) {
      addPoints(totals, prediction.user_id, 5);
    }

    if (
      prediction.prediction_role === "bottom_group_pick" &&
      !bottomGroupIsNoScore &&
      bottomGroupResultId &&
      prediction.contestant_1_id === bottomGroupResultId
    ) {
      addPoints(totals, prediction.user_id, 2);
    }
  }

  return Array.from(totals.entries()).map(([user_id, points]) => ({ user_id, points }));
}

export function calculateBombshellScores(
  predictions: PredictionRow[],
  roundResults: RoundResultRow[]
) {
  const totals = new Map<string, number>();
  const targetResultsByBombshell = new Map<string, string>();

  roundResults.forEach((result) => {
    if (
      result.result_type === "target_pick" &&
      result.bombshell_contestant_id &&
      result.contestant_id
    ) {
      targetResultsByBombshell.set(result.bombshell_contestant_id, result.contestant_id);
    }
  });

  for (const prediction of predictions) {
    if (
      prediction.prediction_role === "target_pick" &&
      prediction.bombshell_contestant_id &&
      prediction.contestant_1_id ===
        targetResultsByBombshell.get(prediction.bombshell_contestant_id)
    ) {
      addPoints(totals, prediction.user_id, 5);
    }
  }

  return Array.from(totals.entries()).map(([user_id, points]) => ({ user_id, points }));
}

export function calculateQuestionChallengeScores(
  predictions: PredictionRow[],
  roundResults: RoundResultRow[]
) {
  const totals = new Map<string, number>();
  const resultsByQuestion = new Map<string, string>();

  roundResults.forEach((result) => {
    if (
      result.result_type === "question_pick" &&
      result.round_question_id &&
      result.contestant_id
    ) {
      resultsByQuestion.set(
        result.round_question_id,
        result.contestant_2_id
          ? [result.contestant_id, result.contestant_2_id].sort().join(":")
          : result.contestant_id
      );
    }
  });

  for (const prediction of predictions) {
    if (
      prediction.prediction_role === "question_pick" &&
      prediction.round_question_id &&
      !!prediction.contestant_1_id &&
      (
        prediction.contestant_2_id
          ? [prediction.contestant_1_id, prediction.contestant_2_id].sort().join(":")
          : prediction.contestant_1_id
      ) === resultsByQuestion.get(prediction.round_question_id)
    ) {
      addPoints(totals, prediction.user_id, 4);
    }
  }

  return Array.from(totals.entries()).map(([user_id, points]) => ({ user_id, points }));
}

export async function runRoundScoring(supabase: SupabaseClient, roundId: string) {
  const [
    { data: roundData, error: roundError },
    { data: moduleData, error: moduleError },
  ] = await Promise.all([
    supabase.from("rounds").select("prediction_type").eq("id", roundId).single(),
    supabase
      .from("round_prediction_modules")
      .select("id, round_id, prediction_type, title, sort_order, created_at")
      .eq("round_id", roundId)
      .order("sort_order")
      .order("created_at"),
  ]);

  if (roundError) {
    throw new Error(roundError.message);
  }

  if (moduleError) {
    throw new Error(moduleError.message);
  }

  const modules =
    (moduleData?.length
      ? sortRoundModules(moduleData as RoundModule[])
      : [
          {
            id: `legacy-${roundId}`,
            round_id: roundId,
            prediction_type: roundData.prediction_type,
            title: null,
            sort_order: 1,
            created_at: new Date(0).toISOString(),
          },
        ]) as RoundModule[];
  const hasRealModules = (moduleData?.length ?? 0) > 0;

  const { error: deleteError } = await supabase.from("scores").delete().eq("round_id", roundId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  const [
    { data: predictions, error: predictionsError },
    { data: actualCouples, error: actualCouplesError },
    { data: roundResults, error: roundResultsError },
  ] = await Promise.all([
    supabase
      .from("predictions")
      .select(
        "user_id, contestant_1_id, contestant_2_id, prediction_role, bombshell_contestant_id, round_question_id, module_id"
      )
      .eq("round_id", roundId),
    supabase
      .from("actual_couples")
      .select("contestant_1_id, contestant_2_id, module_id")
      .eq("round_id", roundId),
    supabase
      .from("round_results")
      .select("result_type, contestant_id, contestant_2_id, bombshell_contestant_id, round_question_id, module_id")
      .eq("round_id", roundId),
  ]);

  if (predictionsError) {
    throw new Error(predictionsError.message);
  }

  if (actualCouplesError) {
    throw new Error(actualCouplesError.message);
  }

  if (roundResultsError) {
    throw new Error(roundResultsError.message);
  }

  const allPredictions = (predictions ?? []) as PredictionRow[];
  const allActualCouples = (actualCouples ?? []) as ActualCoupleRow[];
  const allRoundResults = (roundResults ?? []) as RoundResultRow[];
  const totals = new Map<string, number>();
  const belongsToModule = <T extends { module_id?: string | null }>(row: T, moduleId: string) =>
    hasRealModules ? row.module_id === moduleId : true;

  for (const module of modules) {
    if (isNoScoreEpisode(module.prediction_type)) {
      continue;
    }

    const moduleLabel = getRoundModuleLabel(module);
    let moduleScores: ScoreSummary[] = [];

    if (isRecouplingPrediction(module.prediction_type)) {
      const modulePredictions = allPredictions.filter(
        (prediction) =>
          belongsToModule(prediction, module.id) &&
          (prediction.prediction_role === "couple_pick" || prediction.prediction_role == null) &&
          prediction.contestant_1_id &&
          prediction.contestant_2_id
      );
      const moduleActualCouples = allActualCouples.filter((couple) =>
        belongsToModule(couple, module.id)
      );

      if (moduleActualCouples.length === 0) {
        throw new Error(`Add actual couples for ${moduleLabel} before running scoring.`);
      }

      moduleScores = calculateRecouplingScores(modulePredictions, moduleActualCouples);
    } else if (module.prediction_type === "elimination_prediction") {
      const modulePredictions = allPredictions.filter((prediction) =>
        belongsToModule(prediction, module.id)
      );
      const moduleResults = allRoundResults.filter((result) => belongsToModule(result, module.id));

      if (!moduleResults.some((result) => result.result_type === "dumped_pick")) {
        throw new Error(`Add the dumped islander for ${moduleLabel} before running scoring.`);
      }

      moduleScores = calculateEliminationScores(modulePredictions, moduleResults);
    } else if (module.prediction_type === "bombshell_arrival_prediction") {
      const modulePredictions = allPredictions.filter((prediction) =>
        belongsToModule(prediction, module.id)
      );
      const moduleResults = allRoundResults.filter((result) => belongsToModule(result, module.id));

      if (!moduleResults.some((result) => result.result_type === "target_pick")) {
        throw new Error(`Add at least one bombshell target for ${moduleLabel} before running scoring.`);
      }

      moduleScores = calculateBombshellScores(modulePredictions, moduleResults);
    } else if (isQuestionChallengePrediction(module.prediction_type)) {
      const modulePredictions = allPredictions.filter((prediction) =>
        belongsToModule(prediction, module.id)
      );
      const moduleResults = allRoundResults.filter((result) => belongsToModule(result, module.id));

      if (!moduleResults.some((result) => result.result_type === "question_pick")) {
        throw new Error(`Add the correct answers for ${moduleLabel} before running scoring.`);
      }

      moduleScores = calculateQuestionChallengeScores(modulePredictions, moduleResults);
    } else {
      throw new Error(`Scoring is not enabled for ${moduleLabel}.`);
    }

    moduleScores.forEach((scoreRow) => addPoints(totals, scoreRow.user_id, scoreRow.points));
  }

  const scoreRows = Array.from(totals.entries()).map(([user_id, points]) => ({ user_id, points }));

  if (scoreRows.length === 0) {
    return { scoreRows: [] as ScoreSummary[] };
  }

  const { error: insertError } = await supabase.from("scores").insert(
    scoreRows.map((scoreRow) => ({
      ...scoreRow,
      round_id: roundId,
    }))
  );

  if (insertError) {
    throw new Error(insertError.message);
  }

  return { scoreRows };
}
