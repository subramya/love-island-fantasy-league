"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildCurrentCoupleOptions,
  parseCoupleValue,
  type CurrentCoupleOption,
} from "@/lib/currentCouples";
import { getStoredLeagueUser, type LeagueUser } from "@/lib/leagueUser";
import {
  getPredictionTypeDescription,
  getPredictionTypeLabel,
  isNoScoreEpisode,
  isQuestionChallengePrediction,
  isRecouplingPrediction,
} from "@/lib/predictionTypes";
import {
  buildFallbackRoundModule,
  getRoundModuleDescription,
  getRoundModuleLabel,
  getRoundModuleSummary,
  sortRoundModules,
  type RoundModule,
} from "@/lib/roundModules";
import { supabase } from "@/lib/supabaseClient";

type Contestant = {
  id: string;
  name: string;
  status: string;
  image_url: string | null;
};

type Round = {
  id: string;
  title: string;
  prediction_type: string;
  bombshell_contestant_id: string | null;
  status: string;
  created_at?: string;
};

type RoundForHistory = {
  id: string;
  title: string;
  created_at?: string;
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

type RoundTrackerEntry = {
  round_id: string;
  contestant_id: string;
  tracker_state: string;
  partner_contestant_id: string | null;
};

type PredictionFormRow = {
  rowId: number;
  contestant1Id: string;
  contestant2Id: string;
};

type StoredPrediction = {
  created_at?: string | null;
  bombshell_contestant_id?: string | null;
  contestant_1_id: string | null;
  contestant_2_id: string | null;
  module_id?: string | null;
  prediction_role: string | null;
  round_question_id?: string | null;
};

function createEmptyRow(rowId: number): PredictionFormRow {
  return {
    rowId,
    contestant1Id: "",
    contestant2Id: "",
  };
}

function normalizePair(firstId: string, secondId: string) {
  return [firstId, secondId].sort().join(":");
}

function formatPredictionErrorMessage(message: string) {
  if (message.includes("prediction_role")) {
    return "Your Supabase predictions table is missing the new prediction_role column. Run supabase/add-prediction-role.sql once, then refresh this page.";
  }

  return message;
}

function getContestantName(contestants: Contestant[], contestantId: string) {
  return contestants.find((contestant) => contestant.id === contestantId)?.name ?? "Not picked yet";
}

function getCoupleName(
  contestants: Contestant[],
  contestant1Id: string | null | undefined,
  contestant2Id: string | null | undefined
) {
  if (!contestant1Id || !contestant2Id) {
    return "No pick";
  }

  return `${getContestantName(contestants, contestant1Id)} + ${getContestantName(
    contestants,
    contestant2Id
  )}`;
}

function getBombshellIdsForRound(
  module: RoundModule | null,
  roundBombshellMap: Record<string, string[]>
) {
  if (!module) {
    return [];
  }

  return roundBombshellMap[module.id] ?? [];
}

function formatSavedPredictionSummary(
  roundModules: RoundModule[],
  contestants: Contestant[],
  predictions: StoredPrediction[],
  roundBombshellMap: Record<string, string[]>,
  roundQuestionsMap: Record<string, RoundQuestion[]>
) {
  if (roundModules.length === 0 || predictions.length === 0) {
    return "No saved predictions yet for this round.";
  }
  const summaries = roundModules
    .map((module) => {
      const modulePredictions = predictions.filter((prediction) => prediction.module_id === module.id);

      if (isRecouplingPrediction(module.prediction_type)) {
        const pairs = modulePredictions
          .filter(
            (prediction) =>
              (prediction.prediction_role === "couple_pick" || prediction.prediction_role == null) &&
              prediction.contestant_1_id &&
              prediction.contestant_2_id
          )
          .map(
            (prediction) =>
              `${getContestantName(contestants, prediction.contestant_1_id ?? "")} + ${getContestantName(
                contestants,
                prediction.contestant_2_id ?? ""
              )}`
          );

        return `${getRoundModuleLabel(module)}: ${pairs.length > 0 ? pairs.join(" • ") : "No couples saved yet."}`;
      }

      if (module.prediction_type === "elimination_prediction") {
        const dumpedPick = modulePredictions.find(
          (prediction) => prediction.prediction_role === "dumped_pick"
        );
        const bottomGroupPick = modulePredictions.find(
          (prediction) => prediction.prediction_role === "bottom_group_pick"
        );

        return `${getRoundModuleLabel(module)}: Dumped ${getContestantName(
          contestants,
          dumpedPick?.contestant_1_id ?? ""
        )} • Danger ${
          bottomGroupPick?.contestant_1_id
            ? getContestantName(contestants, bottomGroupPick.contestant_1_id)
            : "No pick"
        }`;
      }

      if (module.prediction_type === "bombshell_arrival_prediction") {
        const bombshellIds = getBombshellIdsForRound(module, roundBombshellMap);

        if (bombshellIds.length === 0) {
          return `${getRoundModuleLabel(module)}: Admin still needs to choose the bombshell lineup.`;
        }

        return `${getRoundModuleLabel(module)}: ${bombshellIds
          .map((bombshellId) => {
            const targetPrediction = modulePredictions.find(
              (prediction) =>
                prediction.prediction_role === "target_pick" &&
                prediction.bombshell_contestant_id === bombshellId
            );

            return `${getContestantName(contestants, bombshellId)} -> ${getContestantName(
              contestants,
              targetPrediction?.contestant_1_id ?? ""
            )}`;
          })
          .join(" • ")}`;
      }

      if (isQuestionChallengePrediction(module.prediction_type)) {
        const roundQuestions = (roundQuestionsMap[module.id] ?? []).sort(
          (left, right) => left.question_order - right.question_order
        );

        if (roundQuestions.length === 0) {
          return `${getRoundModuleLabel(module)}: No questions have been set up yet.`;
        }

        return `${getRoundModuleLabel(module)}: ${roundQuestions
          .map((question, index) => {
            const prediction = modulePredictions.find(
              (row) =>
                row.prediction_role === "question_pick" && row.round_question_id === question.id
            );

            return `Q${index + 1}: ${
              (question.answer_type ?? "islander") === "couple"
                ? getCoupleName(
                    contestants,
                    prediction?.contestant_1_id ?? null,
                    prediction?.contestant_2_id ?? null
                  )
                : getContestantName(contestants, prediction?.contestant_1_id ?? "")
            }`;
          })
          .join(" • ")}`;
      }

      return `${getRoundModuleLabel(module)}: No saved predictions.`;
    })
    .filter(Boolean);

  return summaries.join(" || ");
}

function formatSavedPredictionTime(timestamp: string | null) {
  if (!timestamp) {
    return "";
  }

  const date = new Date(timestamp);

  const eastern = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

  const pacific = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);

  return `${eastern} / ${pacific}`;
}

function getEpisodeNumber(title: string) {
  const match = title.match(/^Episode\s+(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : -1;
}

function sortRoundsForSelection(left: Round, right: Round) {
  const episodeDifference = getEpisodeNumber(right.title) - getEpisodeNumber(left.title);

  if (episodeDifference !== 0) {
    return episodeDifference;
  }

  if (left.created_at && right.created_at) {
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  }

  return right.title.localeCompare(left.title);
}

async function createPredictionFeedPost(user: LeagueUser, round: Round) {
  const { error } = await supabase.from("chat_messages").insert({
    user_id: user.id,
    user_name: "Villa Feed",
    message_type: "system",
    message: `${user.name} just locked in predictions for ${round.title}.`,
    created_at: new Date().toISOString(),
  });

  if (error) {
    throw error;
  }
}

function CastBoard({ contestants }: { contestants: Contestant[] }) {
  return (
    <div className="rounded-3xl border border-yellow-500/20 bg-yellow-500/5 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-100">Episode 1 cast board</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Everyone starting in the villa is right here, so you can scan the faces before locking in the first couples.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {contestants.map((contestant) => (
          <div
            key={contestant.id}
            className="flex items-center gap-3 rounded-2xl border border-zinc-800 bg-zinc-950/90 px-4 py-3"
          >
            <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
              {contestant.image_url ? (
                <Image
                  src={contestant.image_url}
                  alt={contestant.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-lg font-semibold text-zinc-500">
                  {contestant.name.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-medium text-zinc-100">{contestant.name}</p>
              <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                Original islander
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type ContestantPickerProps = {
  contestants: Contestant[];
  label: string;
  helperText: string;
  selectedId: string;
  onSelect: (contestantId: string) => void;
};

function ContestantPicker({
  contestants,
  label,
  helperText,
  selectedId,
  onSelect,
}: ContestantPickerProps) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-100">{label}</h3>
        <p className="mt-1 text-sm text-zinc-400">{helperText}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contestants.map((contestant) => {
          const isSelected = contestant.id === selectedId;

          return (
            <button
              key={contestant.id}
              type="button"
              onClick={() => onSelect(contestant.id)}
              className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                isSelected
                  ? "border-pink-400 bg-pink-500/10 shadow-[0_0_0_1px_rgba(244,114,182,0.35)]"
                  : "border-zinc-800 bg-zinc-950 hover:border-blue-400 hover:bg-zinc-900"
              }`}
            >
              <div className="relative h-14 w-14 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
                {contestant.image_url ? (
                  <Image
                    src={contestant.image_url}
                    alt={contestant.name}
                    fill
                    className="object-cover"
                    sizes="56px"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-lg font-semibold text-zinc-500">
                    {contestant.name.charAt(0)}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-zinc-100">{contestant.name}</p>
                <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                  {isSelected ? "Current pick" : "Tap to choose"}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function CouplePicker({
  couples,
  label,
  helperText,
  selectedValue,
  onSelect,
}: {
  couples: CurrentCoupleOption[];
  label: string;
  helperText: string;
  selectedValue: string;
  onSelect: (coupleValue: string) => void;
}) {
  return (
    <div className="rounded-3xl border border-zinc-800 bg-zinc-900/80 p-5">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-zinc-100">{label}</h3>
        <p className="mt-1 text-sm text-zinc-400">{helperText}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {couples.map((couple) => {
          const isSelected = couple.value === selectedValue;

          return (
            <button
              key={couple.value}
              type="button"
              onClick={() => onSelect(couple.value)}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                isSelected
                  ? "border-pink-400 bg-pink-500/10 shadow-[0_0_0_1px_rgba(244,114,182,0.35)]"
                  : "border-zinc-800 bg-zinc-950 hover:border-blue-400 hover:bg-zinc-900"
              }`}
            >
              <p className="font-medium text-zinc-100">{couple.label}</p>
              <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
                {isSelected ? "Current pick" : "Tap to choose"}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PredictPage() {
  const [user, setUser] = useState<LeagueUser | null>(null);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [dumpedContestantIds, setDumpedContestantIds] = useState<string[]>([]);
  const [historyRounds, setHistoryRounds] = useState<RoundForHistory[]>([]);
  const [roundTrackerEntriesByRoundId, setRoundTrackerEntriesByRoundId] = useState<
    Record<string, RoundTrackerEntry[]>
  >({});
  const [openRounds, setOpenRounds] = useState<Round[]>([]);
  const [roundModulesMap, setRoundModulesMap] = useState<Record<string, RoundModule[]>>({});
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [rowsByModuleId, setRowsByModuleId] = useState<Record<string, PredictionFormRow[]>>({});
  const [nextRowIdByModuleId, setNextRowIdByModuleId] = useState<Record<string, number>>({});
  const [dumpedPickIdsByModuleId, setDumpedPickIdsByModuleId] = useState<Record<string, string>>({});
  const [bottomGroupPickIdsByModuleId, setBottomGroupPickIdsByModuleId] = useState<
    Record<string, string>
  >({});
  const [targetPickIdsByModuleId, setTargetPickIdsByModuleId] = useState<
    Record<string, Record<string, string>>
  >({});
  const [savedPredictions, setSavedPredictions] = useState<StoredPrediction[]>([]);
  const [savedPredictionUpdatedAt, setSavedPredictionUpdatedAt] = useState<string | null>(null);
  const [roundBombshellMap, setRoundBombshellMap] = useState<Record<string, string[]>>({});
  const [roundQuestionsMap, setRoundQuestionsMap] = useState<Record<string, RoundQuestion[]>>({});
  const [questionPickIdsByModuleId, setQuestionPickIdsByModuleId] = useState<
    Record<string, Record<string, string>>
  >({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const openRound = useMemo(
    () => openRounds.find((round) => round.id === selectedRoundId) ?? openRounds[0] ?? null,
    [openRounds, selectedRoundId]
  );
  const openRoundModules = useMemo(
    () =>
      openRound
        ? roundModulesMap[openRound.id]?.length
          ? roundModulesMap[openRound.id]
          : [buildFallbackRoundModule(openRound)]
        : [],
    [openRound, roundModulesMap]
  );
  const activeContestants = contestants.filter(
    (contestant) =>
      contestant.status === "active" && !dumpedContestantIds.includes(contestant.id)
  );
  const currentCoupleOptions = useMemo(
    () => buildCurrentCoupleOptions(contestants, historyRounds, roundTrackerEntriesByRoundId),
    [contestants, historyRounds, roundTrackerEntriesByRoundId]
  );
  const isRoundWatchOnly =
    openRoundModules.length > 0 &&
    openRoundModules.every((module) => isNoScoreEpisode(module.prediction_type));

  useEffect(() => {
    const loadPredictionPage = async () => {
      setLoading(true);
      setErrorMessage("");

      const storedUser = getStoredLeagueUser();

      if (!storedUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      setUser(storedUser);

      const [
        { data: contestantsData, error: contestantsError },
        { data: roundsData, error: roundError },
        { data: historyRoundsData, error: historyRoundsError },
        { data: modulesData, error: modulesError },
        { data: roundBombshellsData, error: roundBombshellsError },
        { data: roundQuestionsData, error: roundQuestionsError },
        { data: roundResultsData, error: roundResultsError },
        { data: trackerEntriesData, error: trackerEntriesError },
      ] = await Promise.all([
        supabase
          .from("contestants")
          .select("id, name, status, image_url")
          .order("name"),
        supabase
          .from("rounds")
          .select("id, title, prediction_type, bombshell_contestant_id, status, created_at")
          .eq("status", "open")
          .order("created_at", { ascending: false }),
        supabase
          .from("rounds")
          .select("id, title, created_at")
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
        supabase
          .from("round_results")
          .select("contestant_id, result_type"),
        supabase
          .from("round_tracker_entries")
          .select("round_id, contestant_id, tracker_state, partner_contestant_id"),
      ]);

      if (
        contestantsError ||
        roundError ||
        historyRoundsError ||
        modulesError ||
        roundBombshellsError ||
        roundQuestionsError ||
        roundResultsError ||
        trackerEntriesError
      ) {
        setErrorMessage(
          contestantsError?.message ??
            roundError?.message ??
            historyRoundsError?.message ??
            modulesError?.message ??
            roundBombshellsError?.message ??
            roundQuestionsError?.message ??
            roundResultsError?.message ??
            trackerEntriesError?.message ??
            "Unable to load predictions."
        );
        setLoading(false);
        return;
      }

      setContestants((contestantsData ?? []) as Contestant[]);
      setHistoryRounds((historyRoundsData ?? []) as RoundForHistory[]);
      const nextRounds = [...((roundsData ?? []) as Round[])].sort(sortRoundsForSelection);
      const nextModulesMap = ((modulesData ?? []) as RoundModule[]).reduce<Record<string, RoundModule[]>>(
        (map, row) => {
          map[row.round_id] = sortRoundModules([...(map[row.round_id] ?? []), row]);
          return map;
        },
        {}
      );
      const nextRoundBombshellMap = ((roundBombshellsData ?? []) as Array<
        RoundBombshellRow & { module_id: string | null }
      >).reduce<
        Record<string, string[]>
      >((map, row) => {
        const mapKey = row.module_id ?? row.round_id;
        map[mapKey] = [...(map[mapKey] ?? []), row.bombshell_contestant_id];
        return map;
      }, {});
      const nextRoundQuestionsMap = ((roundQuestionsData ?? []) as RoundQuestion[]).reduce<
        Record<string, RoundQuestion[]>
      >((map, row) => {
        const mapKey = row.module_id ?? row.round_id;
        map[mapKey] = [...(map[mapKey] ?? []), row].sort(
          (left, right) => left.question_order - right.question_order
        );
        return map;
      }, {});
      const nextTrackerEntriesByRoundId = ((trackerEntriesData ?? []) as RoundTrackerEntry[]).reduce<
        Record<string, RoundTrackerEntry[]>
      >((map, entry) => {
        map[entry.round_id] = [...(map[entry.round_id] ?? []), entry];
        return map;
      }, {});
      setRoundModulesMap(nextModulesMap);
      setRoundBombshellMap(nextRoundBombshellMap);
      setRoundQuestionsMap(nextRoundQuestionsMap);
      setRoundTrackerEntriesByRoundId(nextTrackerEntriesByRoundId);
      setDumpedContestantIds(
        Array.from(
          new Set(
            ((roundResultsData ?? []) as Array<{ contestant_id: string | null; result_type: string }>)
              .filter((result) => result.result_type === "dumped_pick" && result.contestant_id)
              .map((result) => result.contestant_id as string)
          )
        )
      );
      setOpenRounds(nextRounds);
      setSelectedRoundId((currentValue) => {
        const preferredRounds = nextRounds.filter((round) => {
          const modules = nextModulesMap[round.id]?.length
            ? nextModulesMap[round.id]
            : [buildFallbackRoundModule(round)];

          return modules.some((module) => !isNoScoreEpisode(module.prediction_type));
        });
        const roundsToPrefer = preferredRounds.length > 0 ? preferredRounds : nextRounds;

        if (currentValue && roundsToPrefer.some((round) => round.id === currentValue)) {
          return currentValue;
        }

        return roundsToPrefer[0]?.id ?? "";
      });

      setLoading(false);
    };

    void loadPredictionPage();
  }, []);

  useEffect(() => {
    const loadExistingPredictions = async () => {
      if (!user || !selectedRoundId) {
        setRowsByModuleId({});
        setNextRowIdByModuleId({});
        setSavedPredictions([]);
        setSavedPredictionUpdatedAt(null);
        setQuestionPickIdsByModuleId({});
        return;
      }

      const { data: existingPredictions, error: predictionsError } = await supabase
        .from("predictions")
        .select(
          "contestant_1_id, contestant_2_id, prediction_role, bombshell_contestant_id, round_question_id, module_id, created_at"
        )
        .eq("round_id", selectedRoundId)
        .eq("user_id", user.id)
        .order("created_at");

      if (predictionsError) {
        setErrorMessage(formatPredictionErrorMessage(predictionsError.message));
        return;
      }

      const typedPredictions = (existingPredictions ?? []) as StoredPrediction[];
      setSavedPredictions(typedPredictions);
      setSavedPredictionUpdatedAt(
        typedPredictions.length > 0
          ? typedPredictions[typedPredictions.length - 1]?.created_at ?? null
          : null
      );

      const nextRowsByModuleId: Record<string, PredictionFormRow[]> = {};
      const nextRowIdByModuleId: Record<string, number> = {};
      const nextDumpedPickIdsByModuleId: Record<string, string> = {};
      const nextBottomGroupPickIdsByModuleId: Record<string, string> = {};
      const nextTargetPickIdsByModuleId: Record<string, Record<string, string>> = {};
      const nextQuestionPickIdsByModuleId: Record<string, Record<string, string>> = {};

      openRoundModules.forEach((module) => {
        const modulePredictions = typedPredictions.filter(
          (prediction) => prediction.module_id === module.id
        );

        if (isRecouplingPrediction(module.prediction_type)) {
          const couplePredictions = modulePredictions.filter(
            (prediction) =>
              (prediction.prediction_role === "couple_pick" || prediction.prediction_role == null) &&
              prediction.contestant_1_id &&
              prediction.contestant_2_id
          );

          nextRowsByModuleId[module.id] =
            couplePredictions.length > 0
              ? couplePredictions.map((prediction, index) => ({
                  rowId: index + 1,
                  contestant1Id: prediction.contestant_1_id ?? "",
                  contestant2Id: prediction.contestant_2_id ?? "",
                }))
              : [createEmptyRow(1)];
          nextRowIdByModuleId[module.id] = couplePredictions.length + 1 || 2;
          return;
        }

        nextRowsByModuleId[module.id] = [createEmptyRow(1)];
        nextRowIdByModuleId[module.id] = 2;

        if (module.prediction_type === "elimination_prediction") {
          nextDumpedPickIdsByModuleId[module.id] =
            modulePredictions.find((prediction) => prediction.prediction_role === "dumped_pick")
              ?.contestant_1_id ?? "";
          nextBottomGroupPickIdsByModuleId[module.id] =
            modulePredictions.find((prediction) => prediction.prediction_role === "bottom_group_pick")
              ?.contestant_1_id ?? "";
          return;
        }

        if (module.prediction_type === "bombshell_arrival_prediction") {
          nextTargetPickIdsByModuleId[module.id] = modulePredictions.reduce<Record<string, string>>(
            (map, prediction) => {
              if (
                prediction.prediction_role === "target_pick" &&
                prediction.bombshell_contestant_id &&
                prediction.contestant_1_id
              ) {
                map[prediction.bombshell_contestant_id] = prediction.contestant_1_id;
              }
              return map;
            },
            {}
          );
          return;
        }

        if (isQuestionChallengePrediction(module.prediction_type)) {
          nextQuestionPickIdsByModuleId[module.id] = modulePredictions.reduce<Record<string, string>>(
            (map, prediction) => {
              const question = (roundQuestionsMap[module.id] ?? []).find(
                (row) => row.id === prediction.round_question_id
              );
              if (
                prediction.prediction_role === "question_pick" &&
                prediction.round_question_id &&
                prediction.contestant_1_id
              ) {
                map[prediction.round_question_id] =
                  (question?.answer_type ?? "islander") === "couple" && prediction.contestant_2_id
                    ? [prediction.contestant_1_id, prediction.contestant_2_id].sort().join(":")
                    : prediction.contestant_1_id;
              }
              return map;
            },
            {}
          );
        }
      });

      setRowsByModuleId(nextRowsByModuleId);
      setNextRowIdByModuleId(nextRowIdByModuleId);
      setDumpedPickIdsByModuleId(nextDumpedPickIdsByModuleId);
      setBottomGroupPickIdsByModuleId(nextBottomGroupPickIdsByModuleId);
      setTargetPickIdsByModuleId(nextTargetPickIdsByModuleId);
      setQuestionPickIdsByModuleId(nextQuestionPickIdsByModuleId);
    };

    void loadExistingPredictions();
  }, [selectedRoundId, user, openRoundModules, roundQuestionsMap]);

  const updateRow = (
    moduleId: string,
    rowId: number,
    field: "contestant1Id" | "contestant2Id",
    value: string
  ) => {
    setRowsByModuleId((currentValue) => ({
      ...currentValue,
      [moduleId]: (currentValue[moduleId] ?? [createEmptyRow(1)]).map((row) =>
        row.rowId === rowId ? { ...row, [field]: value } : row
      ),
    }));
  };

  const addRow = (moduleId: string) => {
    const nextRowId = nextRowIdByModuleId[moduleId] ?? 2;
    setRowsByModuleId((currentValue) => ({
      ...currentValue,
      [moduleId]: [...(currentValue[moduleId] ?? [createEmptyRow(1)]), createEmptyRow(nextRowId)],
    }));
    setNextRowIdByModuleId((currentValue) => ({
      ...currentValue,
      [moduleId]: nextRowId + 1,
    }));
  };

  const removeRow = (moduleId: string, rowId: number) => {
    setRowsByModuleId((currentValue) => {
      const nextRows = (currentValue[moduleId] ?? []).filter((row) => row.rowId !== rowId);

      return {
        ...currentValue,
        [moduleId]: nextRows.length > 0 ? nextRows : [createEmptyRow(1)],
      };
    });
  };

  const getContestantOptionsForModule = (_module: RoundModule) => activeContestants;
  const isInitialCouplingModule = (module: RoundModule) =>
    module.prediction_type === "initial_coupling_prediction";
  const getSelectedBombshellIds = (module: RoundModule) =>
    getBombshellIdsForRound(module, roundBombshellMap);
  const getSelectedRoundQuestions = (module: RoundModule) =>
    roundQuestionsMap[module.id] ?? [];

  const savePredictions = async () => {
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!user) {
      setErrorMessage("Log in before saving predictions.");
      setSaving(false);
      return;
    }

    if (!openRound) {
      setErrorMessage("There is no open round to save predictions for.");
      setSaving(false);
      return;
    }

    const { error: deleteError } = await supabase
      .from("predictions")
      .delete()
      .eq("user_id", user.id)
      .eq("round_id", openRound.id);

    if (deleteError) {
      setErrorMessage(deleteError.message);
      setSaving(false);
      return;
    }

    if (isRoundWatchOnly) {
      setSavedPredictions([]);
      setSavedPredictionUpdatedAt(null);
      setSuccessMessage("This episode is watch-only, so there is nothing to save.");
      setSaving(false);
      return;
    }

    let predictionRows:
      | Array<{
          user_id: string;
          round_id: string;
          module_id: string;
          prediction_role: string;
          round_question_id?: string | null;
          contestant_1_id: string;
          bombshell_contestant_id?: string | null;
          contestant_2_id?: string | null;
        }>
      | null = null;

    try {
      predictionRows = openRoundModules.flatMap((module) => {
        if (isNoScoreEpisode(module.prediction_type)) {
          return [];
        }

        if (isRecouplingPrediction(module.prediction_type)) {
          const moduleRows = rowsByModuleId[module.id] ?? [createEmptyRow(1)];
          const completedRows = moduleRows.filter(
            (row) => row.contestant1Id.trim() !== "" && row.contestant2Id.trim() !== ""
          );

          if (completedRows.length === 0) {
            throw new Error(`Add at least one predicted couple for ${getRoundModuleLabel(module)}.`);
          }

          if (completedRows.some((row) => row.contestant1Id === row.contestant2Id)) {
            throw new Error(`A contestant cannot be paired with themselves in ${getRoundModuleLabel(module)}.`);
          }

          const uniquePairs = new Set(
            completedRows.map((row) => normalizePair(row.contestant1Id, row.contestant2Id))
          );

          if (uniquePairs.size !== completedRows.length) {
            throw new Error(`Duplicate predicted couples are not allowed in ${getRoundModuleLabel(module)}.`);
          }

          return completedRows.map((row) => ({
            user_id: user.id,
            round_id: openRound.id,
            module_id: module.id,
            prediction_role: "couple_pick",
            contestant_1_id: row.contestant1Id,
            contestant_2_id: row.contestant2Id,
          }));
        }

        if (module.prediction_type === "elimination_prediction") {
          const dumpedPickId = dumpedPickIdsByModuleId[module.id] ?? "";
          const bottomGroupPickId = bottomGroupPickIdsByModuleId[module.id] ?? "";

          if (!dumpedPickId) {
            throw new Error(`Pick who gets dumped for ${getRoundModuleLabel(module)}.`);
          }

          if (bottomGroupPickId && bottomGroupPickId === dumpedPickId) {
            throw new Error(`Choose a different danger pick for ${getRoundModuleLabel(module)}.`);
          }

          return [
            {
              user_id: user.id,
              round_id: openRound.id,
              module_id: module.id,
              prediction_role: "dumped_pick",
              contestant_1_id: dumpedPickId,
            },
            ...(bottomGroupPickId
              ? [
                  {
                    user_id: user.id,
                    round_id: openRound.id,
                    module_id: module.id,
                    prediction_role: "bottom_group_pick",
                    contestant_1_id: bottomGroupPickId,
                  },
                ]
              : []),
          ];
        }

        if (module.prediction_type === "bombshell_arrival_prediction") {
          const bombshellIds = getSelectedBombshellIds(module);
          const moduleTargetPicks = targetPickIdsByModuleId[module.id] ?? {};

          if (bombshellIds.length === 0) {
            throw new Error(
              `Admin still needs to choose which bombshells are in ${getRoundModuleLabel(module)}.`
            );
          }

          if (bombshellIds.some((bombshellId) => !moduleTargetPicks[bombshellId])) {
            throw new Error(`Pick a target for each bombshell in ${getRoundModuleLabel(module)}.`);
          }

          return bombshellIds.map((bombshellId) => ({
            user_id: user.id,
            round_id: openRound.id,
            module_id: module.id,
            prediction_role: "target_pick",
            bombshell_contestant_id: bombshellId,
            contestant_1_id: moduleTargetPicks[bombshellId],
          }));
        }

        if (isQuestionChallengePrediction(module.prediction_type)) {
          const moduleQuestions = getSelectedRoundQuestions(module);
          const moduleQuestionPicks = questionPickIdsByModuleId[module.id] ?? {};

          if (moduleQuestions.length === 0) {
            throw new Error(`Admin still needs to add the questions for ${getRoundModuleLabel(module)}.`);
          }

          if (moduleQuestions.some((question) => !moduleQuestionPicks[question.id])) {
            throw new Error(`Answer every question in ${getRoundModuleLabel(module)} before saving.`);
          }

          return moduleQuestions.map((question) => {
            const selectedAnswer = moduleQuestionPicks[question.id];
            const isCoupleAnswer = (question.answer_type ?? "islander") === "couple";
            const coupleAnswer = isCoupleAnswer ? parseCoupleValue(selectedAnswer) : null;

            return {
              user_id: user.id,
              round_id: openRound.id,
              module_id: module.id,
              prediction_role: "question_pick",
              round_question_id: question.id,
              contestant_1_id: isCoupleAnswer
                ? coupleAnswer?.contestant1Id ?? ""
                : selectedAnswer,
              contestant_2_id: isCoupleAnswer
                ? coupleAnswer?.contestant2Id ?? null
                : null,
            };
          });
        }

        throw new Error(`${getRoundModuleLabel(module)} is not ready to save yet.`);
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save predictions.");
      setSaving(false);
      return;
    }

    if (!predictionRows || predictionRows.length === 0) {
      setErrorMessage("This episode does not have any active prediction modules to save.");
      setSaving(false);
      return;
    }

    const { data: insertedPredictions, error: insertError } = await supabase
      .from("predictions")
      .insert(predictionRows)
      .select(
        "contestant_1_id, contestant_2_id, prediction_role, bombshell_contestant_id, round_question_id, module_id, created_at"
      );

    if (insertError) {
      setErrorMessage(formatPredictionErrorMessage(insertError.message));
    } else {
      const typedPredictions = (insertedPredictions ?? []) as StoredPrediction[];
      setSavedPredictions(typedPredictions);
      setSavedPredictionUpdatedAt(
        typedPredictions.length > 0
          ? typedPredictions[typedPredictions.length - 1]?.created_at ?? null
          : new Date().toISOString()
      );
      try {
        await createPredictionFeedPost(user, openRound);
      } catch {
        // Do not block prediction saving if the feed post fails.
      }
      setSuccessMessage("Predictions saved.");
    }

    setSaving(false);
  };

  return (
    <main className="min-h-screen bg-transparent px-6 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-pink-400">
            Predict
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Make your picks</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Test each round type the same way a player would and see how the prediction flow feels.
          </p>
        </div>

        {loading ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <p className="text-zinc-400">Loading prediction form...</p>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="rounded-3xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
            {errorMessage}
          </section>
        ) : null}

        {successMessage ? (
          <section className="rounded-3xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-sm text-emerald-200">
            {successMessage}
          </section>
        ) : null}

        {!loading && !user ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <p className="text-zinc-300">Log in from the home page before making predictions.</p>
            <Link
              href="/"
              className="mt-4 inline-flex rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
            >
              Back to login
            </Link>
          </section>
        ) : null}

        {user ? (
          <>
            <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-pink-400">
                Logged in as {user.name}
              </p>
              <h2 className="text-xl font-semibold">Current round</h2>
              {openRound ? (
                <div className="mt-3 space-y-2 text-zinc-300">
                  <p>
                    <span className="font-semibold">Title:</span> {openRound.title}
                  </p>
                  <p>
                    <span className="font-semibold">Prediction modules:</span>{" "}
                    {getRoundModuleSummary(openRoundModules)}
                  </p>
                  <p className="text-sm text-zinc-400">
                    {openRoundModules.length > 1
                      ? "This episode has multiple prediction modules. Save all of them together in one submission."
                      : getRoundModuleDescription(openRoundModules[0] ?? buildFallbackRoundModule(openRound))}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-zinc-400">
                  There is no open round right now, so predictions are temporarily closed.
                </p>
              )}
              {openRounds.length > 1 ? (
                <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-zinc-300">
                  Switch round
                  <select
                    value={selectedRoundId}
                    onChange={(event) => setSelectedRoundId(event.target.value)}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                  >
                    {openRounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        {round.title} ({getRoundModuleSummary(
                          roundModulesMap[round.id]?.length
                            ? roundModulesMap[round.id]
                            : [buildFallbackRoundModule(round)]
                        )})
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {openRound && !isRoundWatchOnly ? (
                <div className="mt-5 rounded-2xl border border-blue-500/30 bg-blue-500/8 p-4 text-sm text-blue-100">
                  Your picks auto-load when you switch between open rounds, so you can test each
                  format without losing what you already saved.
                </div>
              ) : null}
              {openRound && !isRoundWatchOnly ? (
                <div className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/90">
                    Saved for this round
                  </p>
                  <p className="mt-2 text-sm leading-7 text-emerald-50">
                    {formatSavedPredictionSummary(
                      openRoundModules,
                      contestants,
                      savedPredictions,
                      roundBombshellMap,
                      roundQuestionsMap
                    )}
                  </p>
                  <p className="mt-2 text-xs text-emerald-200/75">
                    {savedPredictionUpdatedAt
                      ? `Last updated: ${formatSavedPredictionTime(savedPredictionUpdatedAt)}`
                      : "No saved predictions yet."}
                  </p>
                </div>
              ) : null}
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              {openRound ? (
                <div className="space-y-8">
                  {openRoundModules.map((module) => {
                    const contestantOptions = getContestantOptionsForModule(module);
                    const selectedBombshellIds = getSelectedBombshellIds(module);
                    const selectedRoundQuestions = getSelectedRoundQuestions(module);
                    const moduleRows = rowsByModuleId[module.id] ?? [createEmptyRow(1)];
                    const dumpedPickId = dumpedPickIdsByModuleId[module.id] ?? "";
                    const bottomGroupPickId = bottomGroupPickIdsByModuleId[module.id] ?? "";
                    const targetPickIdsByBombshell = targetPickIdsByModuleId[module.id] ?? {};
                    const questionPickIdsByQuestion = questionPickIdsByModuleId[module.id] ?? {};

                    return (
                      <div key={module.id} className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <h2 className="text-xl font-semibold">{getRoundModuleLabel(module)}</h2>
                            <p className="mt-1 text-sm text-zinc-400">
                              {getRoundModuleDescription(module)}
                            </p>
                          </div>
                          {isRecouplingPrediction(module.prediction_type) ? (
                            <button
                              type="button"
                              onClick={() => addRow(module.id)}
                              className="rounded-full border border-zinc-700 bg-zinc-950 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-pink-400 hover:text-pink-300"
                            >
                              Add couple
                            </button>
                          ) : null}
                        </div>

                        {isRecouplingPrediction(module.prediction_type) ? (
                          <div className="mt-6 space-y-4">
                            {isInitialCouplingModule(module) ? (
                              <CastBoard contestants={activeContestants} />
                            ) : null}
                            {moduleRows.map((row, index) => (
                              <div
                                key={`${module.id}-${row.rowId}`}
                                className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                              >
                                <div className="mb-3 flex items-center justify-between">
                                  <p className="text-sm font-semibold text-zinc-300">
                                    Couple {index + 1}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => removeRow(module.id, row.rowId)}
                                    className="text-sm font-medium text-zinc-500 transition hover:text-zinc-300"
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                                    Contestant 1
                                    <select
                                      value={row.contestant1Id}
                                      onChange={(event) =>
                                        updateRow(module.id, row.rowId, "contestant1Id", event.target.value)
                                      }
                                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                                    >
                                      <option value="">Select a contestant</option>
                                      {activeContestants.map((contestant) => (
                                        <option key={contestant.id} value={contestant.id}>
                                          {contestant.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                                    Contestant 2
                                    <select
                                      value={row.contestant2Id}
                                      onChange={(event) =>
                                        updateRow(module.id, row.rowId, "contestant2Id", event.target.value)
                                      }
                                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                                    >
                                      <option value="">Select a contestant</option>
                                      {activeContestants.map((contestant) => (
                                        <option key={contestant.id} value={contestant.id}>
                                          {contestant.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : module.prediction_type === "elimination_prediction" ? (
                          <div className="mt-6 space-y-4">
                            <div className="grid gap-3 rounded-2xl border border-yellow-500/25 bg-yellow-500/8 p-4 text-sm text-yellow-100 sm:grid-cols-2">
                              <p>
                                <span className="font-semibold">Dumped pick:</span>{" "}
                                {getContestantName(contestantOptions, dumpedPickId)}
                              </p>
                              <p>
                                <span className="font-semibold">Danger pick:</span>{" "}
                                {bottomGroupPickId
                                  ? getContestantName(contestantOptions, bottomGroupPickId)
                                  : "Optional"}
                              </p>
                            </div>
                            <ContestantPicker
                              contestants={activeContestants}
                              label="Who gets dumped?"
                              helperText="This is your main elimination call. Pick the islander you think is fully out."
                              selectedId={dumpedPickId}
                              onSelect={(contestantId) =>
                                setDumpedPickIdsByModuleId((currentValue) => ({
                                  ...currentValue,
                                  [module.id]: contestantId,
                                }))
                              }
                            />
                            <ContestantPicker
                              contestants={activeContestants}
                              label="Who lands in danger but survives?"
                              helperText="Optional partial-credit pick for someone who ends up vulnerable without getting dumped."
                              selectedId={bottomGroupPickId}
                              onSelect={(contestantId) =>
                                setBottomGroupPickIdsByModuleId((currentValue) => ({
                                  ...currentValue,
                                  [module.id]: contestantId,
                                }))
                              }
                            />
                          </div>
                        ) : module.prediction_type === "bombshell_arrival_prediction" ? (
                          <div className="mt-6 space-y-4">
                            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/8 p-4 text-sm text-blue-100">
                              <div className="space-y-2">
                                {selectedBombshellIds.map((bombshellId) => (
                                  <p key={bombshellId}>
                                    <span className="font-semibold">
                                      {getContestantName(contestants, bombshellId)} goes after:
                                    </span>{" "}
                                    {getContestantName(
                                      contestantOptions,
                                      targetPickIdsByBombshell[bombshellId] ?? ""
                                    )}
                                  </p>
                                ))}
                              </div>
                            </div>
                            {selectedBombshellIds.length === 0 ? (
                              <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200">
                                Admin still needs to set which bombshells this module is about before players can lock in picks.
                              </div>
                            ) : null}
                            {selectedBombshellIds.map((bombshellId) => (
                              <ContestantPicker
                                key={bombshellId}
                                contestants={contestants}
                                label={`Who does ${getContestantName(contestants, bombshellId)} go after?`}
                                helperText="Every cast member is fair game here. Pick the islander you think gets targeted first."
                                selectedId={targetPickIdsByBombshell[bombshellId] ?? ""}
                                onSelect={(contestantId) =>
                                  setTargetPickIdsByModuleId((currentValue) => ({
                                    ...currentValue,
                                    [module.id]: {
                                      ...(currentValue[module.id] ?? {}),
                                      [bombshellId]: contestantId,
                                    },
                                  }))
                                }
                              />
                            ))}
                          </div>
                        ) : isQuestionChallengePrediction(module.prediction_type) ? (
                          <div className="mt-6 space-y-4">
                            <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/8 p-4 text-sm text-yellow-100">
                              <div className="space-y-2">
                                {selectedRoundQuestions.map((question, index) => (
                                  <p key={question.id}>
                                    <span className="font-semibold">Q{index + 1}:</span> {question.question_text}
                                    <br />
                                    <span className="font-semibold">Your pick:</span>{" "}
                                    {(question.answer_type ?? "islander") === "couple"
                                      ? currentCoupleOptions.find(
                                          (couple) => couple.value === (questionPickIdsByQuestion[question.id] ?? "")
                                        )?.label ?? "No pick"
                                      : getContestantName(
                                          contestants,
                                          questionPickIdsByQuestion[question.id] ?? ""
                                        )}
                                  </p>
                                ))}
                              </div>
                            </div>
                            {selectedRoundQuestions.length === 0 ? (
                              <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200">
                                Admin still needs to add the questions for this module before players can answer.
                              </div>
                            ) : null}
                            {selectedRoundQuestions.some(
                              (question) => (question.answer_type ?? "islander") === "couple"
                            ) && currentCoupleOptions.length === 0 ? (
                              <div className="rounded-2xl border border-red-500/30 bg-red-950/40 p-4 text-sm text-red-200">
                                Admin still needs to update the current villa tracker before couple-answer questions can be picked.
                              </div>
                            ) : null}
                            {selectedRoundQuestions.map((question, index) => (
                              (question.answer_type ?? "islander") === "couple" ? (
                                <CouplePicker
                                  key={question.id}
                                  couples={currentCoupleOptions}
                                  label={`Question ${index + 1}`}
                                  helperText={question.question_text}
                                  selectedValue={questionPickIdsByQuestion[question.id] ?? ""}
                                  onSelect={(coupleValue) =>
                                    setQuestionPickIdsByModuleId((currentValue) => ({
                                      ...currentValue,
                                      [module.id]: {
                                        ...(currentValue[module.id] ?? {}),
                                        [question.id]: coupleValue,
                                      },
                                    }))
                                  }
                                />
                              ) : (
                                <ContestantPicker
                                  key={question.id}
                                  contestants={contestants}
                                  label={`Question ${index + 1}`}
                                  helperText={question.question_text}
                                  selectedId={questionPickIdsByQuestion[question.id] ?? ""}
                                  onSelect={(contestantId) =>
                                    setQuestionPickIdsByModuleId((currentValue) => ({
                                      ...currentValue,
                                      [module.id]: {
                                        ...(currentValue[module.id] ?? {}),
                                        [question.id]: contestantId,
                                      },
                                    }))
                                  }
                                />
                              )
                            ))}
                          </div>
                        ) : (
                          <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-300">
                            {isNoScoreEpisode(module.prediction_type)
                              ? "This module is watch-only, so no picks or points are live."
                              : "This module type does not have a player form yet."}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-300">
                  Open a round in admin to start taking predictions.
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={savePredictions}
                  disabled={
                    saving ||
                    !openRound ||
                    isRoundWatchOnly
                  }
                  className="rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400 disabled:cursor-not-allowed disabled:bg-pink-300"
                >
                  {saving ? "Saving..." : "Save predictions"}
                </button>
                <Link
                  href="/leaderboard"
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-pink-400 hover:text-pink-300"
                >
                  View leaderboard
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
                >
                  Dashboard
                </Link>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
