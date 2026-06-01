export const predictionTypeOptions = [
  {
    value: "initial_coupling_prediction",
    label: "Initial coupling",
    pointsAvailable: true,
    description:
      "Use this for episode 1 when islanders pair up for the very first time. It scores the same way as recoupling rounds.",
  },
  {
    value: "recoupling_prediction",
    label: "Recoupling prediction",
    pointsAvailable: true,
    description:
      "Players predict who couples up. Current scoring supports exact couple and one-right-person partial hits.",
  },
  {
    value: "elimination_prediction",
    label: "Elimination prediction",
    pointsAvailable: true,
    description:
      "Players predict who gets dumped or lands in danger during an elimination-style episode.",
  },
  {
    value: "bombshell_arrival_prediction",
    label: "Bombshell arrival prediction",
    pointsAvailable: true,
    description:
      "Use this when a bombshell arrives and players need to guess which islander gets targeted first.",
  },
  {
    value: "no_score_episode",
    label: "No-score episode",
    pointsAvailable: false,
    description:
      "Watch-only episode. No picks are collected and no points should be awarded.",
  },
] as const;

export type PredictionTypeValue = (typeof predictionTypeOptions)[number]["value"];

export function getPredictionTypeLabel(predictionType: string) {
  if (predictionType === "challenge_winner_prediction") {
    return "Challenge winner prediction";
  }

  return (
    predictionTypeOptions.find((option) => option.value === predictionType)?.label ??
    predictionType
  );
}

export function predictionTypeHasPoints(predictionType: string) {
  if (predictionType === "challenge_winner_prediction") {
    return false;
  }

  return (
    predictionTypeOptions.find((option) => option.value === predictionType)?.pointsAvailable ??
    true
  );
}

export function getPredictionTypeDescription(predictionType: string) {
  if (predictionType === "challenge_winner_prediction") {
    return "Legacy round type. Challenge winner rounds are no longer active in the league setup.";
  }

  return (
    predictionTypeOptions.find((option) => option.value === predictionType)?.description ??
    "Prediction setup for this round type has not been described yet."
  );
}

export function isRecouplingPrediction(predictionType: string) {
  return (
    predictionType === "recoupling_prediction" ||
    predictionType === "initial_coupling_prediction"
  );
}

export function isNoScoreEpisode(predictionType: string) {
  return predictionType === "no_score_episode";
}
