import type { SupabaseClient } from "@supabase/supabase-js";
import { isRecouplingPrediction } from "@/lib/predictionTypes";

type CoupleRow = {
  contestant_1_id: string;
  contestant_2_id: string;
};

type PredictionRow = {
  contestant_1_id: string;
  contestant_2_id?: string | null;
  prediction_role?: string | null;
  user_id: string;
};

type RoundResultRow = {
  result_type: string;
  contestant_id: string | null;
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

  for (const prediction of predictions) {
    if (prediction.prediction_role === "dumped_pick" && prediction.contestant_1_id === dumpedResultId) {
      addPoints(totals, prediction.user_id, 5);
    }

    if (
      prediction.prediction_role === "bottom_group_pick" &&
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
  const targetResultId =
    roundResults.find((result) => result.result_type === "target_pick")?.contestant_id ?? null;

  for (const prediction of predictions) {
    if (prediction.prediction_role === "target_pick" && prediction.contestant_1_id === targetResultId) {
      addPoints(totals, prediction.user_id, 5);
    }
  }

  return Array.from(totals.entries()).map(([user_id, points]) => ({ user_id, points }));
}

export async function runRoundScoring(supabase: SupabaseClient, roundId: string) {
  const { data: roundData, error: roundError } = await supabase
    .from("rounds")
    .select("prediction_type")
    .eq("id", roundId)
    .single();

  if (roundError) {
    throw new Error(roundError.message);
  }

  const predictionType = roundData.prediction_type;

  const { error: deleteError } = await supabase.from("scores").delete().eq("round_id", roundId);

  if (deleteError) {
    throw new Error(deleteError.message);
  }

  let scoreRows: ScoreSummary[] = [];

  if (isRecouplingPrediction(predictionType)) {
    const [
      { data: predictions, error: predictionsError },
      { data: actualCouples, error: actualCouplesError },
    ] = await Promise.all([
      supabase
        .from("predictions")
        .select("user_id, contestant_1_id, contestant_2_id, prediction_role")
        .eq("round_id", roundId),
      supabase
        .from("actual_couples")
        .select("contestant_1_id, contestant_2_id")
        .eq("round_id", roundId),
    ]);

    if (predictionsError) {
      throw new Error(predictionsError.message);
    }

    if (actualCouplesError) {
      throw new Error(actualCouplesError.message);
    }

    if (!actualCouples || actualCouples.length === 0) {
      throw new Error("Add actual couples before running scoring.");
    }

    scoreRows = calculateRecouplingScores(
      ((predictions ?? []) as PredictionRow[]).filter(
        (prediction) =>
          (prediction.prediction_role === "couple_pick" || prediction.prediction_role == null) &&
          prediction.contestant_1_id &&
          prediction.contestant_2_id
      ),
      actualCouples as CoupleRow[]
    );
  } else if (predictionType === "elimination_prediction") {
    const [
      { data: predictions, error: predictionsError },
      { data: roundResults, error: roundResultsError },
    ] = await Promise.all([
      supabase
        .from("predictions")
        .select("user_id, contestant_1_id, prediction_role")
        .eq("round_id", roundId),
      supabase
        .from("round_results")
        .select("result_type, contestant_id")
        .eq("round_id", roundId),
    ]);

    if (predictionsError) {
      throw new Error(predictionsError.message);
    }

    if (roundResultsError) {
      throw new Error(roundResultsError.message);
    }

    if (!(roundResults ?? []).some((result) => result.result_type === "dumped_pick")) {
      throw new Error("Add the actual dumped islander before running elimination scoring.");
    }

    scoreRows = calculateEliminationScores(
      (predictions ?? []) as PredictionRow[],
      (roundResults ?? []) as RoundResultRow[]
    );
  } else if (predictionType === "bombshell_arrival_prediction") {
    const [
      { data: predictions, error: predictionsError },
      { data: roundResults, error: roundResultsError },
    ] = await Promise.all([
      supabase
        .from("predictions")
        .select("user_id, contestant_1_id, prediction_role")
        .eq("round_id", roundId),
      supabase
        .from("round_results")
        .select("result_type, contestant_id")
        .eq("round_id", roundId),
    ]);

    if (predictionsError) {
      throw new Error(predictionsError.message);
    }

    if (roundResultsError) {
      throw new Error(roundResultsError.message);
    }

    if (!(roundResults ?? []).some((result) => result.result_type === "target_pick")) {
      throw new Error("Add the actual bombshell target before running scoring.");
    }

    scoreRows = calculateBombshellScores(
      (predictions ?? []) as PredictionRow[],
      (roundResults ?? []) as RoundResultRow[]
    );
  } else {
    throw new Error("Scoring is not enabled for this round type.");
  }

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
