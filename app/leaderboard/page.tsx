"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredLeagueUser, type LeagueUser as StoredLeagueUser } from "@/lib/leagueUser";
import {
  getPredictionTypeLabel,
  isQuestionChallengePrediction,
  isRecouplingPrediction,
} from "@/lib/predictionTypes";
import {
  buildFallbackRoundModule,
  getRoundModuleLabel,
  getRoundModuleSummary,
  sortRoundModules,
  type RoundModule,
} from "@/lib/roundModules";
import {
  isExactCoupleMatch,
  sharesOnePerson,
} from "@/lib/scoring";
import { supabase } from "@/lib/supabaseClient";

type LeagueUserRow = {
  id: string;
  name: string;
};

type Round = {
  id: string;
  title: string;
  prediction_type: string;
  status: string;
  bombshell_contestant_id: string | null;
};

type RoundBombshellRow = {
  round_id: string;
  module_id: string | null;
  bombshell_contestant_id: string;
};

type RoundQuestion = {
  id: string;
  round_id: string;
  module_id: string | null;
  question_text: string;
  answer_type: string | null;
  question_order: number;
};

type Contestant = {
  id: string;
  name: string;
};

type ScoreRow = {
  user_id: string;
  points: number;
  round_id: string;
};

type PredictionRow = {
  user_id: string;
  round_id: string;
  module_id?: string | null;
  prediction_role: string | null;
  bombshell_contestant_id?: string | null;
  round_question_id?: string | null;
  contestant_1_id: string | null;
  contestant_2_id: string | null;
};

type ActualCouple = {
  round_id: string;
  module_id?: string | null;
  contestant_1_id: string;
  contestant_2_id: string;
};

type RoundResult = {
  round_id: string;
  module_id?: string | null;
  result_type: string;
  bombshell_contestant_id?: string | null;
  round_question_id?: string | null;
  contestant_id: string | null;
  contestant_2_id?: string | null;
};

type LeaderboardEntry = {
  user_id: string;
  name: string;
  totalPoints: number;
};

type RoundResultSummary = {
  roundId: string;
  roundTitle: string;
  moduleSummary: string;
  status: string;
  resultSummary: string;
  playerPredictionSummary: string;
  scoreBreakdown: string[];
  playerPoints: number;
};

function getContestantName(
  contestantsById: Map<string, string>,
  contestantId: string | null | undefined,
  fallback = "Not set"
) {
  if (!contestantId) {
    return fallback;
  }

  return contestantsById.get(contestantId) ?? "Unknown";
}

function getCoupleName(
  contestantsById: Map<string, string>,
  contestant1Id: string | null | undefined,
  contestant2Id: string | null | undefined,
  fallback = "No pick"
) {
  if (!contestant1Id || !contestant2Id) {
    return fallback;
  }

  return `${getContestantName(contestantsById, contestant1Id)} + ${getContestantName(
    contestantsById,
    contestant2Id
  )}`;
}

function describeModuleResults(
  module: RoundModule,
  contestantsById: Map<string, string>,
  actualCouples: ActualCouple[],
  roundResults: RoundResult[],
  roundBombshellMap: Map<string, string[]>,
  roundQuestionsByModuleId: Map<string, RoundQuestion[]>
) {
  if (isRecouplingPrediction(module.prediction_type)) {
    const couples = actualCouples
      .filter((couple) => (couple.module_id ?? module.round_id) === module.id)
      .map((couple) => {
        const firstName = contestantsById.get(couple.contestant_1_id) ?? "Unknown";
        const secondName = contestantsById.get(couple.contestant_2_id) ?? "Unknown";
        return `${firstName} + ${secondName}`;
      });

    return couples.length > 0 ? couples.join(" • ") : "No actual couples entered yet.";
  }

  if (module.prediction_type === "elimination_prediction") {
    const dumpedId =
      roundResults.find(
        (result) => (result.module_id ?? module.round_id) === module.id && result.result_type === "dumped_pick"
      )?.contestant_id ?? null;
    const bottomGroupId =
      roundResults.find(
        (result) => (result.module_id ?? module.round_id) === module.id && result.result_type === "bottom_group_pick"
      )?.contestant_id ?? null;
    const bottomGroupNoScore = roundResults.some(
      (result) => (result.module_id ?? module.round_id) === module.id && result.result_type === "bottom_group_pick_no_score"
    );

    const dumpedName = dumpedId ? contestantsById.get(dumpedId) ?? "Unknown" : "Not set";
    const bottomGroupName = bottomGroupNoScore
      ? "No score"
      : bottomGroupId
        ? contestantsById.get(bottomGroupId) ?? "Unknown"
        : "Not set";

    return `Dumped: ${dumpedName} • Bottom group: ${bottomGroupName}`;
  }

  if (module.prediction_type === "bombshell_arrival_prediction") {
    const bombshellIds = roundBombshellMap.get(module.id) ?? [];

    if (bombshellIds.length === 0) {
      return "No bombshell focus set yet.";
    }

    return bombshellIds
      .map((bombshellId) => {
        const targetId =
          roundResults.find(
            (result) =>
              (result.module_id ?? module.round_id) === module.id &&
              result.result_type === "target_pick" &&
              result.bombshell_contestant_id === bombshellId
          )?.contestant_id ?? null;
        const bombshellName = contestantsById.get(bombshellId) ?? "Unknown";
        const targetName = targetId ? contestantsById.get(targetId) ?? "Unknown" : "Not set";

        return `${bombshellName} went after ${targetName}`;
      })
      .join(" • ");
  }

  if (isQuestionChallengePrediction(module.prediction_type)) {
    const roundQuestions = roundQuestionsByModuleId.get(module.id) ?? [];

    if (roundQuestions.length === 0) {
      return "No questions were set for this round.";
    }

    return roundQuestions
      .map((question, index) => {
        const actualResult = roundResults.find(
          (result) =>
            (result.module_id ?? module.round_id) === module.id &&
            result.result_type === "question_pick" &&
            result.round_question_id === question.id
        );

        if (actualResult && !actualResult.contestant_id && !actualResult.contestant_2_id) {
          return `Q${index + 1}: No-score`;
        }

        const answerId = actualResult?.contestant_id ?? null;

        return `Q${index + 1}: ${
          (question.answer_type ?? "islander") === "couple"
            ? getCoupleName(
                contestantsById,
                actualResult?.contestant_id ?? null,
                actualResult?.contestant_2_id ?? null,
                "Not set"
              )
            : getContestantName(contestantsById, answerId)
        }`;
      })
      .join(" • ");
  }

  return "No results summary for this round type.";
}

function describeModulePredictions(
  module: RoundModule,
  contestantsById: Map<string, string>,
  predictions: PredictionRow[],
  roundBombshellMap: Map<string, string[]>,
  roundQuestionsByModuleId: Map<string, RoundQuestion[]>
) {
  if (isRecouplingPrediction(module.prediction_type)) {
    const couplePredictions = predictions.filter(
      (prediction) =>
        (prediction.module_id ?? module.round_id) === module.id &&
        (prediction.prediction_role === "couple_pick" || prediction.prediction_role == null) &&
        prediction.contestant_1_id &&
        prediction.contestant_2_id
    );

    if (couplePredictions.length === 0) {
      return "No couples saved.";
    }

    return couplePredictions
      .map(
        (prediction) =>
          `${getContestantName(contestantsById, prediction.contestant_1_id)} + ${getContestantName(
            contestantsById,
            prediction.contestant_2_id
          )}`
      )
      .join(" • ");
  }

  if (module.prediction_type === "elimination_prediction") {
    const dumpedPick = predictions.find(
      (prediction) =>
        (prediction.module_id ?? module.round_id) === module.id &&
        prediction.prediction_role === "dumped_pick"
    );
    const bottomGroupPick = predictions.find(
      (prediction) =>
        (prediction.module_id ?? module.round_id) === module.id &&
        prediction.prediction_role === "bottom_group_pick"
    );

    return [
      `Dumped: ${getContestantName(contestantsById, dumpedPick?.contestant_1_id)}`,
      `Bottom group: ${getContestantName(
        contestantsById,
        bottomGroupPick?.contestant_1_id,
        "No pick"
      )}`,
    ].join(" • ");
  }

  if (module.prediction_type === "bombshell_arrival_prediction") {
    const bombshellIds = roundBombshellMap.get(module.id) ?? [];

    if (bombshellIds.length === 0) {
      return "No bombshells set for this round.";
    }

    return bombshellIds
      .map((bombshellId) => {
        const prediction = predictions.find(
          (row) =>
            (row.module_id ?? module.round_id) === module.id &&
            row.prediction_role === "target_pick" && row.bombshell_contestant_id === bombshellId
        );

        return `${getContestantName(contestantsById, bombshellId)} -> ${getContestantName(
          contestantsById,
          prediction?.contestant_1_id,
          "No pick"
        )}`;
      })
      .join(" • ");
  }

  if (isQuestionChallengePrediction(module.prediction_type)) {
    const roundQuestions = roundQuestionsByModuleId.get(module.id) ?? [];

    if (roundQuestions.length === 0) {
      return "No questions were set for this round.";
    }

    return roundQuestions
      .map((question, index) => {
        const prediction = predictions.find(
          (row) =>
            (row.module_id ?? module.round_id) === module.id &&
            row.prediction_role === "question_pick" && row.round_question_id === question.id
        );

        return `Q${index + 1}: ${
          (question.answer_type ?? "islander") === "couple"
            ? getCoupleName(
                contestantsById,
                prediction?.contestant_1_id,
                prediction?.contestant_2_id,
                "No pick"
              )
            : getContestantName(contestantsById, prediction?.contestant_1_id, "No pick")
        }`;
      })
      .join(" • ");
  }

  return "No prediction required.";
}

function buildModuleScoreBreakdown(
  module: RoundModule,
  contestantsById: Map<string, string>,
  predictions: PredictionRow[],
  actualCouples: ActualCouple[],
  roundResults: RoundResult[],
  roundBombshellMap: Map<string, string[]>,
  roundQuestionsByModuleId: Map<string, RoundQuestion[]>
) {
  if (isRecouplingPrediction(module.prediction_type)) {
    const couplePredictions = predictions.filter(
      (prediction) =>
        (prediction.module_id ?? module.round_id) === module.id &&
        (prediction.prediction_role === "couple_pick" || prediction.prediction_role == null) &&
        prediction.contestant_1_id &&
        prediction.contestant_2_id
    );

    if (couplePredictions.length === 0) {
      return ["No couples saved for this round."];
    }

    if (!actualCouples.some((couple) => (couple.module_id ?? module.round_id) === module.id)) {
      return ["Waiting for actual couples to be entered."];
    }

    return couplePredictions.map((prediction) => {
      const formattedPair = `${getContestantName(
        contestantsById,
        prediction.contestant_1_id
      )} + ${getContestantName(contestantsById, prediction.contestant_2_id)}`;

      const roundActualCouples = actualCouples.filter(
        (couple) => (couple.module_id ?? module.round_id) === module.id
      );
      const exactMatch = roundActualCouples.some((actualCouple) =>
        isExactCoupleMatch(
          {
            contestant_1_id: prediction.contestant_1_id as string,
            contestant_2_id: prediction.contestant_2_id as string,
          },
          actualCouple
        )
      );

      if (exactMatch) {
        return `${formattedPair}: exact couple match (+5)`;
      }

      const partialMatch = roundActualCouples.some((actualCouple) =>
        sharesOnePerson(
          {
            contestant_1_id: prediction.contestant_1_id as string,
            contestant_2_id: prediction.contestant_2_id as string,
          },
          actualCouple
        )
      );

      if (partialMatch) {
        return `${formattedPair}: one correct person, wrong partner (+2)`;
      }

      return `${formattedPair}: no match (+0)`;
    });
  }

  if (module.prediction_type === "elimination_prediction") {
    const dumpedActual = roundResults.find(
      (result) => (result.module_id ?? module.round_id) === module.id && result.result_type === "dumped_pick"
    );
    const bottomGroupActual = roundResults.find(
      (result) => (result.module_id ?? module.round_id) === module.id && result.result_type === "bottom_group_pick"
    );
    const bottomGroupNoScore = roundResults.some(
      (result) => (result.module_id ?? module.round_id) === module.id && result.result_type === "bottom_group_pick_no_score"
    );
    const dumpedPrediction = predictions.find(
      (prediction) =>
        (prediction.module_id ?? module.round_id) === module.id &&
        prediction.prediction_role === "dumped_pick"
    );
    const bottomGroupPrediction = predictions.find(
      (prediction) =>
        (prediction.module_id ?? module.round_id) === module.id &&
        prediction.prediction_role === "bottom_group_pick"
    );

    if (!dumpedActual) {
      return ["Waiting for actual elimination results to be entered."];
    }

    return [
      dumpedPrediction
        ? dumpedPrediction.contestant_1_id === dumpedActual.contestant_id
          ? `Dumped pick (${getContestantName(contestantsById, dumpedPrediction.contestant_1_id)}): correct (+5)`
          : `Dumped pick (${getContestantName(contestantsById, dumpedPrediction.contestant_1_id)}): incorrect (+0)`
        : "No dumped pick saved (+0)",
      bottomGroupNoScore
        ? "Bottom group pick: no-score for this round"
        : bottomGroupPrediction
          ? bottomGroupActual && bottomGroupPrediction.contestant_1_id === bottomGroupActual.contestant_id
            ? `Bottom group pick (${getContestantName(contestantsById, bottomGroupPrediction.contestant_1_id)}): correct (+2)`
            : `Bottom group pick (${getContestantName(contestantsById, bottomGroupPrediction.contestant_1_id)}): incorrect (+0)`
          : "No bottom group pick saved (+0)",
    ];
  }

  if (module.prediction_type === "bombshell_arrival_prediction") {
    const bombshellIds = roundBombshellMap.get(module.id) ?? [];

    if (bombshellIds.length === 0) {
      return ["No bombshells set for this round."];
    }

    return bombshellIds.map((bombshellId) => {
      const bombshellName = getContestantName(contestantsById, bombshellId);
      const prediction = predictions.find(
        (row) =>
          (row.module_id ?? module.round_id) === module.id &&
          row.prediction_role === "target_pick" && row.bombshell_contestant_id === bombshellId
      );
      const actual = roundResults.find(
        (result) =>
          (result.module_id ?? module.round_id) === module.id &&
          result.result_type === "target_pick" &&
          result.bombshell_contestant_id === bombshellId
      );

      if (!actual) {
        return `${bombshellName}: waiting for actual result`;
      }

      if (!prediction) {
        return `${bombshellName}: no pick saved (+0)`;
      }

      return prediction.contestant_1_id === actual.contestant_id
        ? `${bombshellName} -> ${getContestantName(contestantsById, prediction.contestant_1_id)}: correct (+5)`
        : `${bombshellName} -> ${getContestantName(contestantsById, prediction.contestant_1_id)}: incorrect (+0)`;
    });
  }

  if (isQuestionChallengePrediction(module.prediction_type)) {
    const roundQuestions = roundQuestionsByModuleId.get(module.id) ?? [];

    if (roundQuestions.length === 0) {
      return ["No questions were set for this round."];
    }

    return roundQuestions.map((question, index) => {
      const prediction = predictions.find(
        (row) =>
          (row.module_id ?? module.round_id) === module.id &&
          row.prediction_role === "question_pick" &&
          row.round_question_id === question.id
      );
      const actual = roundResults.find(
        (result) =>
          (result.module_id ?? module.round_id) === module.id &&
          result.result_type === "question_pick" &&
          result.round_question_id === question.id
      );

      if (!actual) {
        return `Q${index + 1} (${question.question_text}): waiting for actual answer`;
      }

      if (!actual.contestant_id && !actual.contestant_2_id) {
        return `Q${index + 1} (${question.question_text}): no-score for this question (+0)`;
      }

      if (!prediction) {
        return `Q${index + 1} (${question.question_text}): no pick saved (+0)`;
      }

      const isCoupleAnswer = (question.answer_type ?? "islander") === "couple";
      const isCorrect = isCoupleAnswer
        ? !!prediction.contestant_1_id &&
          !!prediction.contestant_2_id &&
          !!actual.contestant_id &&
          !!actual.contestant_2_id &&
          [prediction.contestant_1_id, prediction.contestant_2_id].sort().join(":") ===
            [actual.contestant_id, actual.contestant_2_id].sort().join(":")
        : prediction.contestant_1_id === actual.contestant_id;

      return isCorrect
        ? `Q${index + 1} (${question.question_text}): correct (+4)`
        : `Q${index + 1} (${question.question_text}): incorrect (+0)`;
    });
  }

  return ["This round did not use a scored prediction flow."];
}

function describeRoundResults(
  modules: RoundModule[],
  contestantsById: Map<string, string>,
  actualCouples: ActualCouple[],
  roundResults: RoundResult[],
  roundBombshellMap: Map<string, string[]>,
  roundQuestionsByModuleId: Map<string, RoundQuestion[]>
) {
  return modules
    .map((module) => `${getRoundModuleLabel(module)}: ${describeModuleResults(
      module,
      contestantsById,
      actualCouples,
      roundResults,
      roundBombshellMap,
      roundQuestionsByModuleId
    )}`)
    .join(" || ");
}

function describePlayerPredictions(
  modules: RoundModule[],
  contestantsById: Map<string, string>,
  predictions: PredictionRow[],
  roundBombshellMap: Map<string, string[]>,
  roundQuestionsByModuleId: Map<string, RoundQuestion[]>
) {
  return modules
    .map((module) => `${getRoundModuleLabel(module)}: ${describeModulePredictions(
      module,
      contestantsById,
      predictions,
      roundBombshellMap,
      roundQuestionsByModuleId
    )}`)
    .join(" || ");
}

function buildScoreBreakdown(
  modules: RoundModule[],
  contestantsById: Map<string, string>,
  predictions: PredictionRow[],
  actualCouples: ActualCouple[],
  roundResults: RoundResult[],
  roundBombshellMap: Map<string, string[]>,
  roundQuestionsByModuleId: Map<string, RoundQuestion[]>
) {
  return modules.flatMap((module) => [
    `${getRoundModuleLabel(module)}`,
    ...buildModuleScoreBreakdown(
      module,
      contestantsById,
      predictions,
      actualCouples,
      roundResults,
      roundBombshellMap,
      roundQuestionsByModuleId
    ).map((line) => `- ${line}`),
  ]);
}

export default function LeaderboardPage() {
  const [currentUser, setCurrentUser] = useState<StoredLeagueUser | null>(null);
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [roundResultSummaries, setRoundResultSummaries] = useState<RoundResultSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadLeaderboard = async () => {
      setLoading(true);
      setErrorMessage("");
      const storedUser = getStoredLeagueUser();
      setCurrentUser(storedUser);

      const [
        { data: scoreData, error: scoreError },
        { data: userData, error: userError },
        { data: roundData, error: roundError },
        { data: moduleData, error: moduleError },
        { data: roundBombshellData, error: roundBombshellError },
        { data: roundQuestionData, error: roundQuestionError },
        { data: contestantData, error: contestantError },
        { data: actualCoupleData, error: actualCoupleError },
        { data: roundResultsData, error: roundResultsError },
        { data: predictionData, error: predictionError },
      ] = await Promise.all([
        supabase
          .from("scores")
          .select("user_id, points, round_id")
          .order("created_at", { ascending: false }),
        supabase.from("league_users").select("id, name").order("name"),
        supabase
          .from("rounds")
          .select("id, title, prediction_type, bombshell_contestant_id, status")
          .order("created_at", { ascending: false }),
        supabase
          .from("round_prediction_modules")
          .select("id, round_id, prediction_type, title, sort_order, created_at")
          .order("sort_order")
          .order("created_at"),
        supabase
          .from("round_bombshells")
          .select("round_id, module_id, bombshell_contestant_id"),
        supabase
          .from("round_questions")
          .select("id, round_id, module_id, question_text, answer_type, question_order")
          .order("question_order")
          .order("created_at"),
        supabase.from("contestants").select("id, name").order("name"),
        supabase
          .from("actual_couples")
          .select("round_id, module_id, contestant_1_id, contestant_2_id"),
        supabase
          .from("round_results")
          .select("round_id, module_id, result_type, contestant_id, contestant_2_id, bombshell_contestant_id, round_question_id"),
        storedUser
          ? supabase
              .from("predictions")
              .select(
                "user_id, round_id, module_id, prediction_role, bombshell_contestant_id, round_question_id, contestant_1_id, contestant_2_id"
              )
              .eq("user_id", storedUser.id)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (
        scoreError ||
        userError ||
        roundError ||
        moduleError ||
        roundBombshellError ||
        roundQuestionError ||
        contestantError ||
        actualCoupleError ||
        roundResultsError ||
        predictionError
      ) {
        setErrorMessage(
          scoreError?.message ??
            userError?.message ??
            roundError?.message ??
            moduleError?.message ??
            roundBombshellError?.message ??
            roundQuestionError?.message ??
            contestantError?.message ??
            actualCoupleError?.message ??
            roundResultsError?.message ??
            predictionError?.message ??
            "Unable to load leaderboard."
        );
        setLoading(false);
        return;
      }

      const userMap = new Map(
        ((userData ?? []) as LeagueUserRow[]).map((user) => [user.id, user.name])
      );

      const totals = (scoreData ?? []).reduce<Map<string, number>>((map, row) => {
        const typedRow = row as ScoreRow;
        map.set(typedRow.user_id, (map.get(typedRow.user_id) ?? 0) + typedRow.points);
        return map;
      }, new Map());

      const contestantsById = new Map(
        ((contestantData ?? []) as Contestant[]).map((contestant) => [contestant.id, contestant.name])
      );
      const roundModulesMap = ((moduleData ?? []) as RoundModule[]).reduce<Map<string, RoundModule[]>>(
        (map, module) => {
          map.set(module.round_id, sortRoundModules([...(map.get(module.round_id) ?? []), module]));
          return map;
        },
        new Map()
      );
      const roundBombshellMap = ((roundBombshellData ?? []) as RoundBombshellRow[]).reduce<
        Map<string, string[]>
      >((map, row) => {
        const key = row.module_id ?? row.round_id;
        map.set(key, [...(map.get(key) ?? []), row.bombshell_contestant_id]);
        return map;
      }, new Map());
      const roundQuestionsByModuleId = ((roundQuestionData ?? []) as RoundQuestion[]).reduce<
        Map<string, RoundQuestion[]>
      >((map, row) => {
        const key = row.module_id ?? row.round_id;
        map.set(
          key,
          [...(map.get(key) ?? []), row].sort(
            (left, right) => left.question_order - right.question_order
          )
        );
        return map;
      }, new Map());

      const nextEntries = ((userData ?? []) as LeagueUserRow[])
        .map((user) => ({
          user_id: user.id,
          name: user.name,
          totalPoints: totals.get(user.id) ?? 0,
        }))
        .sort((left, right) => right.totalPoints - left.totalPoints);

      const pointsByRound = (scoreData ?? []).reduce<Map<string, number>>((map, row) => {
        const typedRow = row as ScoreRow;
        if (storedUser && typedRow.user_id === storedUser.id) {
          map.set(typedRow.round_id, (map.get(typedRow.round_id) ?? 0) + typedRow.points);
        }
        return map;
      }, new Map());

      const nextRoundResultSummaries = ((roundData ?? []) as Round[]).map((round) => {
        const roundModules = roundModulesMap.get(round.id)?.length
          ? roundModulesMap.get(round.id) ?? []
          : [buildFallbackRoundModule(round)];
        const roundPredictions = ((predictionData ?? []) as PredictionRow[]).filter(
          (prediction) => prediction.round_id === round.id
        );

        return {
          roundId: round.id,
          roundTitle: round.title,
          moduleSummary: getRoundModuleSummary(roundModules),
          status: round.status,
          resultSummary: describeRoundResults(
            roundModules,
            contestantsById,
            (actualCoupleData ?? []) as ActualCouple[],
            (roundResultsData ?? []) as RoundResult[],
            roundBombshellMap,
            roundQuestionsByModuleId
          ),
          playerPredictionSummary: describePlayerPredictions(
            roundModules,
            contestantsById,
            roundPredictions,
            roundBombshellMap,
            roundQuestionsByModuleId
          ),
          scoreBreakdown: buildScoreBreakdown(
            roundModules,
            contestantsById,
            roundPredictions,
            (actualCoupleData ?? []) as ActualCouple[],
            (roundResultsData ?? []) as RoundResult[],
            roundBombshellMap,
            roundQuestionsByModuleId
          ),
          playerPoints: pointsByRound.get(round.id) ?? 0,
        };
      });

      setEntries(nextEntries);
      setRoundResultSummaries(nextRoundResultSummaries);
      setLoading(false);
    };

    void loadLeaderboard();
  }, []);

  return (
    <main className="min-h-screen bg-transparent px-6 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-pink-400">
            Leaderboard
          </p>
          <h1 className="mt-3 text-4xl font-semibold">League standings</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Scores are grouped by player and sorted from highest to lowest total points.
          </p>
        </div>

        {loading ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <p className="text-zinc-400">Loading leaderboard...</p>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="rounded-3xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
            {errorMessage}
          </section>
        ) : null}

        {!loading ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            {entries.length > 0 ? (
              <div className="space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold">Top players</h2>
                  <p className="mt-2 text-sm text-zinc-400">
                    Ranked from most points to least points.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  {entries.slice(0, 3).map((entry, index) => (
                    <article
                      key={entry.user_id}
                      className={`rounded-3xl border p-5 ${
                        index === 0
                          ? "border-yellow-300/30 bg-yellow-300/10"
                          : index === 1
                            ? "border-sky-400/30 bg-sky-500/10"
                            : "border-pink-400/30 bg-pink-500/10"
                      }`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                        #{index + 1}
                      </p>
                      <p className="mt-3 text-lg font-semibold text-zinc-100">{entry.name}</p>
                      <p className="mt-2 text-sm text-zinc-300">{entry.totalPoints} points</p>
                    </article>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-3">
                    <thead>
                      <tr className="text-left text-sm text-zinc-500">
                        <th className="px-4">Rank</th>
                        <th className="px-4">Name</th>
                        <th className="px-4">Total points</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, index) => (
                        <tr key={entry.user_id} className="rounded-2xl bg-zinc-900">
                          <td className="rounded-l-2xl px-4 py-3 font-semibold">
                            {index + 1}
                          </td>
                          <td className="px-4 py-3 text-sm text-zinc-300">{entry.name}</td>
                          <td className="rounded-r-2xl px-4 py-3 font-semibold">
                            {entry.totalPoints}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <p className="text-zinc-400">No league players have joined yet.</p>
            )}
          </section>
        ) : null}

        {!loading ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className="flex flex-col gap-2">
              <h2 className="text-2xl font-semibold">Your round results</h2>
              <p className="text-sm text-zinc-400">
                {currentUser
                  ? `Round-by-round results for ${currentUser.name}.`
                  : "Log in to see your own round-by-round results."}
              </p>
            </div>

            {!currentUser ? (
              <p className="mt-4 text-zinc-400">Head back to the home page and log in first.</p>
            ) : roundResultSummaries.length > 0 ? (
              <div className="mt-6 space-y-3">
                {roundResultSummaries.map((summary) => (
                  <article
                    key={summary.roundId}
                    className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-zinc-100">{summary.roundTitle}</p>
                        <p className="text-sm text-zinc-400">
                          {summary.moduleSummary} • {summary.status}
                        </p>
                      </div>
                      <div className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100">
                        {summary.playerPoints} points for you
                      </div>
                    </div>
                    <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
                      <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                          What you picked
                        </p>
                        <p className="mt-2 text-sm leading-7 text-zinc-200">
                          {summary.playerPredictionSummary}
                        </p>
                      </div>

                      <div className="rounded-2xl border border-zinc-800 bg-black/30 p-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                          Actual result
                        </p>
                        <p className="mt-2 text-sm leading-7 text-zinc-200">
                          {summary.resultSummary}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-zinc-800 bg-black/30 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        How your score was calculated
                      </p>
                      <div className="mt-3 space-y-2">
                        {summary.scoreBreakdown.map((line) => (
                          <p key={`${summary.roundId}-${line}`} className="text-sm leading-7 text-zinc-300">
                            {line}
                          </p>
                        ))}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="mt-4 text-zinc-400">No rounds found yet.</p>
            )}
          </section>
        ) : null}

        <section className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
          >
            Dashboard
          </Link>
          <Link
            href="/predict"
            className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-pink-400 hover:text-pink-300"
          >
            Make predictions
          </Link>
          <Link
            href="/chat"
            className="rounded-full border border-sky-400/30 bg-sky-500/10 px-5 py-3 text-sm font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20"
          >
            Open villa feed
          </Link>
          <Link
            href="/"
            className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Home
          </Link>
        </section>
      </div>
    </main>
  );
}
