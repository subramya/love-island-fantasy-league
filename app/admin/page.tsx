"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { unlockAdmin } from "@/lib/adminAccess";
import {
  contestantTypeOptions,
  getContestantTypeLabel,
} from "@/lib/contestantTypes";
import {
  getPredictionTypeDescription,
  getPredictionTypeLabel,
  isQuestionChallengePrediction,
  isRecouplingPrediction,
  predictionTypeHasPoints,
  predictionTypeOptions,
} from "@/lib/predictionTypes";
import { runRoundScoring } from "@/lib/scoring";
import { supabase } from "@/lib/supabaseClient";

type Contestant = {
  id: string;
  name: string;
  status: string;
  contestant_type: string;
  image_url: string | null;
};

type Round = {
  id: string;
  title: string;
  prediction_type: string;
  bombshell_contestant_id: string | null;
  status: string;
};

type RoundBombshellRow = {
  round_id: string;
  bombshell_contestant_id: string;
};

type RoundQuestion = {
  id: string;
  round_id: string;
  question_text: string;
  question_order: number;
};

type RoundTrackerEntry = {
  round_id: string;
  contestant_id: string;
  tracker_state: string;
  partner_contestant_id: string | null;
};

type EpisodeRecap = {
  id: string;
  round_id: string;
  headline: string | null;
  recap_text: string;
};

type LeagueMember = {
  id: string;
  name: string;
  email: string | null;
};

type NotificationDraft = {
  kind: "round" | "leaderboard" | "software";
  roundTitle: string;
  recipients: string[];
  subject: string;
  body: string;
  mailtoLink: string;
};

type CoupleFormRow = {
  rowId: number;
  contestant1Id: string;
  contestant2Id: string;
};

type RoundResultRow = {
  bombshell_contestant_id?: string | null;
  round_question_id?: string | null;
  result_type: string;
  contestant_id: string | null;
};

function createEmptyCoupleRow(rowId: number): CoupleFormRow {
  return {
    rowId,
    contestant1Id: "",
    contestant2Id: "",
  };
}

function getContestantDisplayName(contestants: Contestant[], contestantId: string | null) {
  if (!contestantId) {
    return "Not set";
  }

  return contestants.find((contestant) => contestant.id === contestantId)?.name ?? "Unknown islander";
}

function toggleContestantId(currentValue: string[], contestantId: string) {
  return currentValue.includes(contestantId)
    ? currentValue.filter((id) => id !== contestantId)
    : [...currentValue, contestantId];
}

function createEmptyQuestionPrompt() {
  return "";
}

type BombshellSelectorGroupProps = {
  contestants: Contestant[];
  selectedIds: string[];
  onToggle: (contestantId: string) => void;
};

function BombshellSelectorGroup({
  contestants,
  selectedIds,
  onToggle,
}: BombshellSelectorGroupProps) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {contestants.map((contestant) => {
        const isSelected = selectedIds.includes(contestant.id);

        return (
          <button
            key={contestant.id}
            type="button"
            onClick={() => onToggle(contestant.id)}
            className={`rounded-2xl border px-4 py-3 text-left text-sm font-medium transition ${
              isSelected
                ? "border-sky-400 bg-sky-500/12 text-sky-100"
                : "border-zinc-800 bg-zinc-950 text-zinc-200 hover:border-sky-400/60 hover:bg-zinc-900"
            }`}
          >
            {contestant.name}
          </button>
        );
      })}
    </div>
  );
}

export default function AdminPage() {
  const [adminPassword, setAdminPassword] = useState("");
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [leagueMembers, setLeagueMembers] = useState<LeagueMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [contestantName, setContestantName] = useState("");
  const [contestantImageUrl, setContestantImageUrl] = useState("");
  const [newContestantStatus, setNewContestantStatus] = useState("active");
  const [newContestantType, setNewContestantType] = useState("original_islander");
  const [contestantStatuses, setContestantStatuses] = useState<Record<string, string>>({});
  const [contestantTypes, setContestantTypes] = useState<Record<string, string>>({});
  const [roundTitle, setRoundTitle] = useState("");
  const [predictionType, setPredictionType] = useState("recoupling_prediction");
  const [selectedBombshellContestantIds, setSelectedBombshellContestantIds] = useState<string[]>([]);
  const [questionPrompts, setQuestionPrompts] = useState<string[]>([
    createEmptyQuestionPrompt(),
    createEmptyQuestionPrompt(),
  ]);
  const [roundBombshellSelections, setRoundBombshellSelections] = useState<Record<string, string[]>>(
    {}
  );
  const [roundQuestionsByRoundId, setRoundQuestionsByRoundId] = useState<
    Record<string, RoundQuestion[]>
  >({});
  const [roundTrackerEntriesByRoundId, setRoundTrackerEntriesByRoundId] = useState<
    Record<string, RoundTrackerEntry[]>
  >({});
  const [episodeRecaps, setEpisodeRecaps] = useState<EpisodeRecap[]>([]);
  const [roundStatus, setRoundStatus] = useState("open");
  const [selectedActualRoundId, setSelectedActualRoundId] = useState("");
  const [selectedTrackerRoundId, setSelectedTrackerRoundId] = useState("");
  const [recapRoundId, setRecapRoundId] = useState("");
  const [recapHeadline, setRecapHeadline] = useState("");
  const [recapText, setRecapText] = useState("");
  const [trackerStatesByContestantId, setTrackerStatesByContestantId] = useState<
    Record<string, string>
  >({});
  const [trackerPartnersByContestantId, setTrackerPartnersByContestantId] = useState<
    Record<string, string>
  >({});
  const [scoringRoundId, setScoringRoundId] = useState("");
  const [leaderboardRoundId, setLeaderboardRoundId] = useState("");
  const [softwareUpdateTitle, setSoftwareUpdateTitle] = useState("");
  const [softwareUpdateBody, setSoftwareUpdateBody] = useState("");
  const [actualCoupleRows, setActualCoupleRows] = useState<CoupleFormRow[]>([
    createEmptyCoupleRow(1),
  ]);
  const [nextCoupleRowId, setNextCoupleRowId] = useState(2);
  const [actualDumpedContestantId, setActualDumpedContestantId] = useState("");
  const [actualBottomGroupContestantId, setActualBottomGroupContestantId] = useState("");
  const [actualBombshellTargetIdsByBombshell, setActualBombshellTargetIdsByBombshell] = useState<
    Record<string, string>
  >({});
  const [actualQuestionAnswerIdsByQuestion, setActualQuestionAnswerIdsByQuestion] = useState<
    Record<string, string>
  >({});
  const [notificationDraft, setNotificationDraft] = useState<NotificationDraft | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const activeContestants = contestants.filter((contestant) => contestant.status === "active");
  const selectedActualRound =
    rounds.find((round) => round.id === selectedActualRoundId) ?? null;
  const selectedTrackerRound =
    rounds.find((round) => round.id === selectedTrackerRoundId) ?? null;
  const selectedActualRoundBombshellIds = selectedActualRound
    ? roundBombshellSelections[selectedActualRound.id]?.length
      ? roundBombshellSelections[selectedActualRound.id]
      : selectedActualRound.bombshell_contestant_id
        ? [selectedActualRound.bombshell_contestant_id]
        : []
    : [];

  const loadAdminData = async () => {
    setLoading(true);
    setErrorMessage("");

    const [
      { data: contestantsData, error: contestantsError },
      { data: roundsData, error: roundsError },
      { data: leagueMembersData, error: leagueMembersError },
      { data: roundBombshellsData, error: roundBombshellsError },
      { data: roundQuestionsData, error: roundQuestionsError },
      { data: roundTrackerEntriesData, error: roundTrackerEntriesError },
      { data: episodeRecapsData, error: episodeRecapsError },
    ] = await Promise.all([
      supabase
        .from("contestants")
        .select("id, name, status, contestant_type, image_url")
        .order("created_at", { ascending: false }),
      supabase
        .from("rounds")
        .select("id, title, prediction_type, bombshell_contestant_id, status")
        .order("created_at", { ascending: false }),
      supabase
        .from("league_users")
        .select("id, name, email")
        .order("name"),
      supabase
        .from("round_bombshells")
        .select("round_id, bombshell_contestant_id"),
      supabase
        .from("round_questions")
        .select("id, round_id, question_text, question_order")
        .order("question_order")
        .order("created_at"),
      supabase
        .from("round_tracker_entries")
        .select("round_id, contestant_id, tracker_state, partner_contestant_id"),
      supabase
        .from("episode_recaps")
        .select("id, round_id, headline, recap_text")
        .order("created_at", { ascending: false }),
    ]);

    if (
      contestantsError ||
      roundsError ||
      leagueMembersError ||
      roundBombshellsError ||
      roundQuestionsError ||
      roundTrackerEntriesError ||
      episodeRecapsError
    ) {
      setErrorMessage(
        contestantsError?.message ??
          roundsError?.message ??
          leagueMembersError?.message ??
          roundBombshellsError?.message ??
          roundQuestionsError?.message ??
          roundTrackerEntriesError?.message ??
          episodeRecapsError?.message ??
          "Unable to load admin data."
      );
      setLoading(false);
      return;
    }

    const nextContestants = (contestantsData ?? []) as Contestant[];
    const nextRounds = (roundsData ?? []) as Round[];
    const nextRoundBombshellSelections = ((roundBombshellsData ?? []) as RoundBombshellRow[]).reduce<
      Record<string, string[]>
    >((map, row) => {
      map[row.round_id] = [...(map[row.round_id] ?? []), row.bombshell_contestant_id];
      return map;
    }, {});
    const nextRoundQuestionsByRoundId = ((roundQuestionsData ?? []) as RoundQuestion[]).reduce<
      Record<string, RoundQuestion[]>
    >((map, row) => {
      map[row.round_id] = [...(map[row.round_id] ?? []), row].sort(
        (left, right) => left.question_order - right.question_order
      );
      return map;
    }, {});
    const nextRoundTrackerEntriesByRoundId = (
      (roundTrackerEntriesData ?? []) as RoundTrackerEntry[]
    ).reduce<Record<string, RoundTrackerEntry[]>>((map, row) => {
      map[row.round_id] = [...(map[row.round_id] ?? []), row];
      return map;
    }, {});

    setContestants(nextContestants);
    setRounds(nextRounds);
    setRoundBombshellSelections(
      nextRounds.reduce<Record<string, string[]>>((map, round) => {
        map[round.id] =
          nextRoundBombshellSelections[round.id]?.length
            ? nextRoundBombshellSelections[round.id]
            : round.bombshell_contestant_id
              ? [round.bombshell_contestant_id]
              : [];
        return map;
      }, {})
    );
    setRoundQuestionsByRoundId(nextRoundQuestionsByRoundId);
    setRoundTrackerEntriesByRoundId(nextRoundTrackerEntriesByRoundId);
    setEpisodeRecaps((episodeRecapsData ?? []) as EpisodeRecap[]);
    setLeagueMembers((leagueMembersData ?? []) as LeagueMember[]);
    setContestantStatuses(
      nextContestants.reduce<Record<string, string>>((map, contestant) => {
        map[contestant.id] = contestant.status;
        return map;
      }, {})
    );
    setContestantTypes(
      nextContestants.reduce<Record<string, string>>((map, contestant) => {
        map[contestant.id] = contestant.contestant_type ?? "original_islander";
        return map;
      }, {})
    );
    setSelectedActualRoundId((currentValue) => currentValue || nextRounds[0]?.id || "");
    setSelectedTrackerRoundId((currentValue) => currentValue || nextRounds[0]?.id || "");
    setScoringRoundId((currentValue) => currentValue || nextRounds[0]?.id || "");
    setLeaderboardRoundId((currentValue) => currentValue || nextRounds[0]?.id || "");
    setRecapRoundId((currentValue) => currentValue || nextRounds[0]?.id || "");
    setLoading(false);
  };

  useEffect(() => {
    setLoading(false);
  }, []);

  useEffect(() => {
    const loadSelectedRoundResults = async () => {
      if (!isUnlocked || !selectedActualRound) {
        setActualCoupleRows([createEmptyCoupleRow(1)]);
        setNextCoupleRowId(2);
        setActualDumpedContestantId("");
        setActualBottomGroupContestantId("");
        setActualBombshellTargetIdsByBombshell({});
        setActualQuestionAnswerIdsByQuestion({});
        return;
      }

      if (isRecouplingPrediction(selectedActualRound.prediction_type)) {
        const { data, error } = await supabase
          .from("actual_couples")
          .select("contestant_1_id, contestant_2_id")
          .eq("round_id", selectedActualRound.id)
          .order("created_at");

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        const typedCouples = (data ?? []) as Array<{
          contestant_1_id: string;
          contestant_2_id: string;
        }>;

        if (typedCouples.length > 0) {
          setActualCoupleRows(
            typedCouples.map((couple, index) => ({
              rowId: index + 1,
              contestant1Id: couple.contestant_1_id,
              contestant2Id: couple.contestant_2_id,
            }))
          );
          setNextCoupleRowId(typedCouples.length + 1);
        } else {
          setActualCoupleRows([createEmptyCoupleRow(1)]);
          setNextCoupleRowId(2);
        }

        setActualDumpedContestantId("");
        setActualBottomGroupContestantId("");
        setActualBombshellTargetIdsByBombshell({});
        setActualQuestionAnswerIdsByQuestion({});
        return;
      }

      if (
        selectedActualRound.prediction_type === "elimination_prediction" ||
        selectedActualRound.prediction_type === "bombshell_arrival_prediction" ||
        isQuestionChallengePrediction(selectedActualRound.prediction_type)
      ) {
        const { data, error } = await supabase
          .from("round_results")
          .select("result_type, contestant_id, bombshell_contestant_id, round_question_id")
          .eq("round_id", selectedActualRound.id);

        if (error) {
          setErrorMessage(error.message);
          return;
        }

        const typedResults = (data ?? []) as RoundResultRow[];
        setActualCoupleRows([createEmptyCoupleRow(1)]);
        setNextCoupleRowId(2);
        setActualDumpedContestantId(
          typedResults.find((result) => result.result_type === "dumped_pick")?.contestant_id ?? ""
        );
        setActualBottomGroupContestantId(
          typedResults.find((result) => result.result_type === "bottom_group_pick")?.contestant_id ??
            ""
        );
        setActualBombshellTargetIdsByBombshell(
          typedResults.reduce<Record<string, string>>((map, result) => {
            if (
              result.result_type === "target_pick" &&
              result.bombshell_contestant_id &&
              result.contestant_id
            ) {
              map[result.bombshell_contestant_id] = result.contestant_id;
            }
            return map;
          }, {})
        );
        setActualQuestionAnswerIdsByQuestion(
          typedResults.reduce<Record<string, string>>((map, result) => {
            if (
              result.result_type === "question_pick" &&
              result.round_question_id &&
              result.contestant_id
            ) {
              map[result.round_question_id] = result.contestant_id;
            }
            return map;
          }, {})
        );
        return;
      }

      setActualCoupleRows([createEmptyCoupleRow(1)]);
      setNextCoupleRowId(2);
      setActualDumpedContestantId("");
      setActualBottomGroupContestantId("");
      setActualBombshellTargetIdsByBombshell({});
      setActualQuestionAnswerIdsByQuestion({});
    };

    void loadSelectedRoundResults();
  }, [isUnlocked, selectedActualRoundId, selectedActualRound?.prediction_type]);

  useEffect(() => {
    if (!isUnlocked || !selectedTrackerRound) {
      setTrackerStatesByContestantId({});
      setTrackerPartnersByContestantId({});
      return;
    }

    const existingEntries = roundTrackerEntriesByRoundId[selectedTrackerRound.id] ?? [];
    const nextStates = contestants.reduce<Record<string, string>>((map, contestant) => {
      const existingEntry = existingEntries.find((entry) => entry.contestant_id === contestant.id);
      map[contestant.id] = existingEntry?.tracker_state ?? "";
      return map;
    }, {});
    const nextPartners = contestants.reduce<Record<string, string>>((map, contestant) => {
      const existingEntry = existingEntries.find((entry) => entry.contestant_id === contestant.id);
      map[contestant.id] = existingEntry?.partner_contestant_id ?? "";
      return map;
    }, {});

    setTrackerStatesByContestantId(nextStates);
    setTrackerPartnersByContestantId(nextPartners);
  }, [isUnlocked, selectedTrackerRoundId, selectedTrackerRound, contestants, roundTrackerEntriesByRoundId]);

  useEffect(() => {
    if (!isUnlocked) {
      setRecapHeadline("");
      setRecapText("");
      return;
    }

    const existingRecap = episodeRecaps.find((recap) => recap.round_id === recapRoundId);
    setRecapHeadline(existingRecap?.headline ?? "");
    setRecapText(existingRecap?.recap_text ?? "");
  }, [isUnlocked, recapRoundId, episodeRecaps]);

  const handleAdminUnlock = () => {
    setErrorMessage("");
    setSuccessMessage("");

    if (!unlockAdmin(adminPassword.trim())) {
      setErrorMessage("That password is not giving main character energy. Try again.");
      return;
    }

    setAdminPassword("");
    setIsUnlocked(true);
    void loadAdminData();
  };

  const addContestant = async () => {
    if (!contestantName.trim()) {
      setErrorMessage("Enter a contestant name.");
      setSuccessMessage("");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const { error } = await supabase.from("contestants").insert({
      name: contestantName.trim(),
      status: newContestantStatus,
      contestant_type: newContestantType,
      image_url: contestantImageUrl.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setContestantName("");
    setContestantImageUrl("");
    setNewContestantStatus("active");
    setNewContestantType("original_islander");
    setSuccessMessage("Contestant added.");
    await loadAdminData();
  };

  const updateContestantProfile = async (contestantId: string) => {
    setErrorMessage("");
    setSuccessMessage("");

    const nextStatus = contestantStatuses[contestantId];
    const nextContestantType = contestantTypes[contestantId] ?? "original_islander";

    const { error } = await supabase
      .from("contestants")
      .update({ status: nextStatus, contestant_type: nextContestantType })
      .eq("id", contestantId);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    setSuccessMessage("Contestant profile updated.");
    await loadAdminData();
  };

  const deleteRound = async (roundId: string) => {
    setErrorMessage("");
    setSuccessMessage("");

    const [
      { error: deleteScoresError },
      { error: deletePredictionsError },
      { error: deleteActualCouplesError },
      { error: deleteRoundResultsError },
      { error: deleteRoundBombshellsError },
      { error: deleteEpisodeRecapsError },
    ] = await Promise.all([
      supabase.from("scores").delete().eq("round_id", roundId),
      supabase.from("predictions").delete().eq("round_id", roundId),
      supabase.from("actual_couples").delete().eq("round_id", roundId),
      supabase.from("round_results").delete().eq("round_id", roundId),
      supabase.from("round_bombshells").delete().eq("round_id", roundId),
      supabase.from("episode_recaps").delete().eq("round_id", roundId),
    ]);

    if (
      deleteScoresError ||
      deletePredictionsError ||
      deleteActualCouplesError ||
      deleteRoundResultsError ||
      deleteRoundBombshellsError ||
      deleteEpisodeRecapsError
    ) {
      setErrorMessage(
        deleteScoresError?.message ??
          deletePredictionsError?.message ??
          deleteActualCouplesError?.message ??
          deleteRoundResultsError?.message ??
          deleteRoundBombshellsError?.message ??
          deleteEpisodeRecapsError?.message ??
          "Unable to clear round data before deletion."
      );
      return;
    }

    const { error: deleteRoundError } = await supabase
      .from("rounds")
      .delete()
      .eq("id", roundId);

    if (deleteRoundError) {
      setErrorMessage(deleteRoundError.message);
      return;
    }

    setSuccessMessage("Round deleted.");
    await loadAdminData();
  };

  const createRound = async () => {
    if (!roundTitle.trim() || !predictionType.trim()) {
      setErrorMessage("Enter a round title and prediction type.");
      setSuccessMessage("");
      return;
    }

    if (
      predictionType === "bombshell_arrival_prediction" &&
      selectedBombshellContestantIds.length === 0
    ) {
      setErrorMessage("Choose at least one bombshell for this round.");
      setSuccessMessage("");
      return;
    }

    const trimmedQuestionPrompts = questionPrompts
      .map((prompt) => prompt.trim())
      .filter((prompt) => prompt !== "");

    if (isQuestionChallengePrediction(predictionType) && trimmedQuestionPrompts.length === 0) {
      setErrorMessage("Add at least one question for the question challenge round.");
      setSuccessMessage("");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const { data: insertedRound, error } = await supabase
      .from("rounds")
      .insert({
        title: roundTitle.trim(),
        prediction_type: predictionType.trim(),
        bombshell_contestant_id:
          predictionType === "bombshell_arrival_prediction"
            ? selectedBombshellContestantIds[0]
            : null,
        status: roundStatus,
      })
      .select("id")
      .single();

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    if (predictionType === "bombshell_arrival_prediction" && insertedRound) {
      const { error: insertBombshellsError } = await supabase.from("round_bombshells").insert(
        selectedBombshellContestantIds.map((contestantId) => ({
          round_id: insertedRound.id,
          bombshell_contestant_id: contestantId,
        }))
      );

      if (insertBombshellsError) {
        setErrorMessage(insertBombshellsError.message);
        return;
      }
    }

    if (isQuestionChallengePrediction(predictionType) && insertedRound) {
      const { error: insertQuestionsError } = await supabase.from("round_questions").insert(
        trimmedQuestionPrompts.map((questionText, index) => ({
          round_id: insertedRound.id,
          question_text: questionText,
          question_order: index + 1,
        }))
      );

      if (insertQuestionsError) {
        setErrorMessage(insertQuestionsError.message);
        return;
      }
    }

    setRoundTitle("");
    setPredictionType("recoupling_prediction");
    setSelectedBombshellContestantIds([]);
    setQuestionPrompts([createEmptyQuestionPrompt(), createEmptyQuestionPrompt()]);
    setRoundStatus("open");
    setSuccessMessage("Round created.");
    await loadAdminData();
  };

  const saveRoundBombshellSelection = async (roundId: string) => {
    const selectedContestantIds = roundBombshellSelections[roundId] ?? [];

    if (selectedContestantIds.length === 0) {
      setErrorMessage("Choose at least one bombshell before saving.");
      setSuccessMessage("");
      return;
    }

    const { error: deleteBombshellsError } = await supabase
      .from("round_bombshells")
      .delete()
      .eq("round_id", roundId);

    if (deleteBombshellsError) {
      setErrorMessage(deleteBombshellsError.message);
      setSuccessMessage("");
      return;
    }

    const { error: insertBombshellsError } = await supabase.from("round_bombshells").insert(
      selectedContestantIds.map((contestantId) => ({
        round_id: roundId,
        bombshell_contestant_id: contestantId,
      }))
    );

    if (insertBombshellsError) {
      setErrorMessage(insertBombshellsError.message);
      setSuccessMessage("");
      return;
    }

    const { error } = await supabase
      .from("rounds")
      .update({ bombshell_contestant_id: selectedContestantIds[0] ?? null })
      .eq("id", roundId);

    if (error) {
      setErrorMessage(error.message);
      setSuccessMessage("");
      return;
    }

    setSuccessMessage("Bombshell lineup saved for that round.");
    setErrorMessage("");
    await loadAdminData();
  };

  const updateRoundStatus = async (roundId: string, nextStatus: "open" | "locked") => {
    const { error } = await supabase
      .from("rounds")
      .update({ status: nextStatus })
      .eq("id", roundId);

    if (error) {
      setErrorMessage(error.message);
      setSuccessMessage("");
      return;
    }

    setSuccessMessage(
      nextStatus === "locked"
        ? "Round locked. Players can no longer change predictions for it."
        : "Round reopened."
    );
    setErrorMessage("");
    await loadAdminData();
  };

  const addActualCoupleRow = () => {
    setActualCoupleRows((currentRows) => [
      ...currentRows,
      createEmptyCoupleRow(nextCoupleRowId),
    ]);
    setNextCoupleRowId((currentValue) => currentValue + 1);
  };

  const updateActualCoupleRow = (
    rowId: number,
    field: "contestant1Id" | "contestant2Id",
    value: string
  ) => {
    setActualCoupleRows((currentRows) =>
      currentRows.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row))
    );
  };

  const saveActualCouples = async () => {
    if (!selectedActualRoundId) {
      setErrorMessage("Select a round before saving actual couples.");
      setSuccessMessage("");
      return;
    }

    const completedRows = actualCoupleRows.filter(
      (row) => row.contestant1Id.trim() !== "" && row.contestant2Id.trim() !== ""
    );

    if (completedRows.length === 0) {
      setErrorMessage("Add at least one actual couple.");
      setSuccessMessage("");
      return;
    }

    if (completedRows.some((row) => row.contestant1Id === row.contestant2Id)) {
      setErrorMessage("A contestant cannot be paired with themselves.");
      setSuccessMessage("");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    const { error: deleteError } = await supabase
      .from("actual_couples")
      .delete()
      .eq("round_id", selectedActualRoundId);

    if (deleteError) {
      setErrorMessage(deleteError.message);
      return;
    }

    const { error: insertError } = await supabase.from("actual_couples").insert(
      completedRows.map((row) => ({
        round_id: selectedActualRoundId,
        contestant_1_id: row.contestant1Id,
        contestant_2_id: row.contestant2Id,
      }))
    );

    if (insertError) {
      setErrorMessage(insertError.message);
      return;
    }

    setActualCoupleRows([createEmptyCoupleRow(1)]);
    setNextCoupleRowId(2);
    setSuccessMessage("Actual couples saved.");
  };

  const saveEliminationResults = async () => {
    if (!selectedActualRoundId) {
      setErrorMessage("Select a round before saving elimination results.");
      setSuccessMessage("");
      return;
    }

    if (!actualDumpedContestantId) {
      setErrorMessage("Choose the dumped islander before saving.");
      setSuccessMessage("");
      return;
    }

    if (
      actualBottomGroupContestantId &&
      actualBottomGroupContestantId === actualDumpedContestantId
    ) {
      setErrorMessage("The bottom-group survivor should be different from the dumped islander.");
      setSuccessMessage("");
      return;
    }

    const resultRows = [
      {
        round_id: selectedActualRoundId,
        result_type: "dumped_pick",
        contestant_id: actualDumpedContestantId,
      },
      ...(actualBottomGroupContestantId
        ? [
            {
              round_id: selectedActualRoundId,
              result_type: "bottom_group_pick",
              contestant_id: actualBottomGroupContestantId,
            },
          ]
        : []),
    ];

    const { error: deleteError } = await supabase
      .from("round_results")
      .delete()
      .eq("round_id", selectedActualRoundId);

    if (deleteError) {
      setErrorMessage(deleteError.message);
      setSuccessMessage("");
      return;
    }

    const { error: insertError } = await supabase.from("round_results").insert(resultRows);

    if (insertError) {
      setErrorMessage(insertError.message);
      setSuccessMessage("");
      return;
    }

    setSuccessMessage("Elimination results saved.");
    setErrorMessage("");
  };

  const saveBombshellResults = async () => {
    if (!selectedActualRoundId) {
      setErrorMessage("Select a round before saving bombshell results.");
      setSuccessMessage("");
      return;
    }

    if (selectedActualRoundBombshellIds.length === 0) {
      setErrorMessage("Set at least one bombshell for this round before saving results.");
      setSuccessMessage("");
      return;
    }

    if (
      selectedActualRoundBombshellIds.some(
        (bombshellId) => !actualBombshellTargetIdsByBombshell[bombshellId]
      )
    ) {
      setErrorMessage("Choose who each bombshell actually went after.");
      setSuccessMessage("");
      return;
    }

    const { error: deleteError } = await supabase
      .from("round_results")
      .delete()
      .eq("round_id", selectedActualRoundId);

    if (deleteError) {
      setErrorMessage(deleteError.message);
      setSuccessMessage("");
      return;
    }

    const { error: insertError } = await supabase.from("round_results").insert(
      selectedActualRoundBombshellIds.map((bombshellId) => ({
        round_id: selectedActualRoundId,
        result_type: "target_pick",
        bombshell_contestant_id: bombshellId,
        contestant_id: actualBombshellTargetIdsByBombshell[bombshellId],
      }))
    );

    if (insertError) {
      setErrorMessage(insertError.message);
      setSuccessMessage("");
      return;
    }

    setSuccessMessage("Bombshell results saved.");
    setErrorMessage("");
  };

  const saveQuestionChallengeResults = async () => {
    if (!selectedActualRoundId || !selectedActualRound) {
      setErrorMessage("Select a round before saving question challenge results.");
      setSuccessMessage("");
      return;
    }

    const roundQuestions = roundQuestionsByRoundId[selectedActualRound.id] ?? [];

    if (roundQuestions.length === 0) {
      setErrorMessage("Add the round questions first before saving actual answers.");
      setSuccessMessage("");
      return;
    }

    if (roundQuestions.some((question) => !actualQuestionAnswerIdsByQuestion[question.id])) {
      setErrorMessage("Choose the correct islander answer for each question.");
      setSuccessMessage("");
      return;
    }

    const { error: deleteError } = await supabase
      .from("round_results")
      .delete()
      .eq("round_id", selectedActualRoundId);

    if (deleteError) {
      setErrorMessage(deleteError.message);
      setSuccessMessage("");
      return;
    }

    const { error: insertError } = await supabase.from("round_results").insert(
      roundQuestions.map((question) => ({
        round_id: selectedActualRoundId,
        result_type: "question_pick",
        round_question_id: question.id,
        contestant_id: actualQuestionAnswerIdsByQuestion[question.id],
      }))
    );

    if (insertError) {
      setErrorMessage(insertError.message);
      setSuccessMessage("");
      return;
    }

    setSuccessMessage("Question challenge answers saved.");
    setErrorMessage("");
  };

  const scoreRound = async () => {
    if (!scoringRoundId) {
      setErrorMessage("Select a round before running scoring.");
      setSuccessMessage("");
      return;
    }

    setErrorMessage("");
    setSuccessMessage("");

    try {
      await runRoundScoring(supabase, scoringRoundId);
      const { error: updateError } = await supabase
        .from("rounds")
        .update({ status: "scored" })
        .eq("id", scoringRoundId);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setSuccessMessage("Scoring completed for the selected round.");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to score the selected round."
      );
    }
  };

  const saveTrackerEntries = async () => {
    if (!selectedTrackerRoundId) {
      setErrorMessage("Select a round before saving villa tracker entries.");
      setSuccessMessage("");
      return;
    }

    const entriesToSave = contestants
      .map((contestant) => {
        const trackerState = trackerStatesByContestantId[contestant.id];
        const partnerContestantId = trackerPartnersByContestantId[contestant.id] || null;

        if (!trackerState) {
          return null;
        }

        if (trackerState === "coupled" && !partnerContestantId) {
          throw new Error(`Choose a partner for ${contestant.name} before saving.`);
        }

        if (trackerState === "coupled" && partnerContestantId === contestant.id) {
          throw new Error(`${contestant.name} cannot be paired with themselves.`);
        }

        return {
          round_id: selectedTrackerRoundId,
          contestant_id: contestant.id,
          tracker_state: trackerState,
          partner_contestant_id: trackerState === "coupled" ? partnerContestantId : null,
        };
      })
      .filter(Boolean) as Array<{
      round_id: string;
      contestant_id: string;
      tracker_state: string;
      partner_contestant_id: string | null;
    }>;

    try {
      const { error: deleteError } = await supabase
        .from("round_tracker_entries")
        .delete()
        .eq("round_id", selectedTrackerRoundId);

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      if (entriesToSave.length > 0) {
        const { error: insertError } = await supabase
          .from("round_tracker_entries")
          .insert(entriesToSave);

        if (insertError) {
          throw new Error(insertError.message);
        }
      }

      setSuccessMessage("Villa tracker saved for that round.");
      setErrorMessage("");
      await loadAdminData();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to save villa tracker entries."
      );
      setSuccessMessage("");
    }
  };

  const saveEpisodeRecap = async () => {
    if (!recapRoundId) {
      setErrorMessage("Select a round before saving an episode recap.");
      setSuccessMessage("");
      return;
    }

    if (!recapText.trim()) {
      setErrorMessage("Write the recap paragraph before saving.");
      setSuccessMessage("");
      return;
    }

    const { error } = await supabase.from("episode_recaps").upsert(
      {
        round_id: recapRoundId,
        headline: recapHeadline.trim() || null,
        recap_text: recapText.trim(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "round_id" }
    );

    if (error) {
      setErrorMessage(error.message);
      setSuccessMessage("");
      return;
    }

    setSuccessMessage("Episode recap saved.");
    setErrorMessage("");
    await loadAdminData();
  };

  const deleteEpisodeRecap = async (roundId: string) => {
    const { error } = await supabase.from("episode_recaps").delete().eq("round_id", roundId);

    if (error) {
      setErrorMessage(error.message);
      setSuccessMessage("");
      return;
    }

    if (recapRoundId === roundId) {
      setRecapHeadline("");
      setRecapText("");
    }

    setSuccessMessage("Episode recap deleted.");
    setErrorMessage("");
    await loadAdminData();
  };

  const getRecipientEmails = () => {
    const recipientEmails = leagueMembers
      .map((member) => member.email?.trim().toLowerCase() ?? "")
      .filter((email, index, emails) => email && emails.indexOf(email) === index);

    if (recipientEmails.length === 0) {
      setErrorMessage("No player emails are saved yet, so there is nobody to notify.");
      setSuccessMessage("");
      return null;
    }

    return recipientEmails;
  };

  const openNotificationDraft = ({
    kind,
    roundTitle,
    recipients,
    subject,
    body,
  }: Omit<NotificationDraft, "mailtoLink">) => {
    const mailtoLink = `mailto:?bcc=${encodeURIComponent(
      recipients.join(",")
    )}&subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    setNotificationDraft({
      kind,
      roundTitle,
      recipients,
      subject,
      body,
      mailtoLink,
    });
    window.location.href = mailtoLink;
    setSuccessMessage(
      `Prepared a ${kind} email for ${recipients.length} player(s). If your mail app does not open, use the draft panel below.`
    );
    setErrorMessage("");
  };

  const notifyPlayersAboutRound = (round: Round) => {
    const recipientEmails = getRecipientEmails();

    if (!recipientEmails) {
      return;
    }

    const selectedBombshellIds =
      roundBombshellSelections[round.id]?.length
        ? roundBombshellSelections[round.id]
        : round.bombshell_contestant_id
          ? [round.bombshell_contestant_id]
          : [];

    const bombshellFocusLine =
      round.prediction_type === "bombshell_arrival_prediction" && selectedBombshellIds.length > 0
        ? [
            `Bombshell focus: ${selectedBombshellIds
              .map((contestantId) => getContestantDisplayName(contestants, contestantId))
              .join(", ")}`,
            "",
          ]
        : [];

    const subject = `New Love Island round: ${round.title}`;
    const body = [
      "Hey islanders,",
      "",
      "A new Love Island Fantasy League round is open.",
      "",
      `Round: ${round.title}`,
      `Prediction type: ${getPredictionTypeLabel(round.prediction_type)}`,
      ...bombshellFocusLine,
      "",
      "Make your picks here:",
      `${window.location.origin}/predict`,
      "",
      "See you in the villa,",
      "Ramya",
    ].join("\n");

    openNotificationDraft({
      kind: "round",
      roundTitle: round.title,
      recipients: recipientEmails,
      subject,
      body,
    });
  };

  const notifyPlayersAboutLeaderboard = async () => {
    if (!leaderboardRoundId) {
      setErrorMessage("Select a round before drafting a leaderboard update.");
      setSuccessMessage("");
      return;
    }

    const recipientEmails = getRecipientEmails();

    if (!recipientEmails) {
      return;
    }

    const selectedRound = rounds.find((round) => round.id === leaderboardRoundId);

    if (!selectedRound) {
      setErrorMessage("Unable to find that round for the leaderboard update.");
      setSuccessMessage("");
      return;
    }

    const { data: scoreRows, error: scoreError } = await supabase
      .from("scores")
      .select("user_id, points, round_id");

    if (scoreError) {
      setErrorMessage(scoreError.message);
      setSuccessMessage("");
      return;
    }

    const typedScoreRows = (scoreRows ?? []) as Array<{
      user_id: string;
      points: number;
      round_id: string;
    }>;

    const memberNameMap = new Map(leagueMembers.map((member) => [member.id, member.name]));
    const totalPointsByUser = typedScoreRows.reduce<Map<string, number>>((map, score) => {
      map.set(score.user_id, (map.get(score.user_id) ?? 0) + score.points);
      return map;
    }, new Map());
    const roundPointsByUser = typedScoreRows.reduce<Map<string, number>>((map, score) => {
      if (score.round_id === leaderboardRoundId) {
        map.set(score.user_id, (map.get(score.user_id) ?? 0) + score.points);
      }
      return map;
    }, new Map());

    const overallLeaderboard = leagueMembers
      .map((member) => ({
        user_id: member.id,
        name: member.name,
        totalPoints: totalPointsByUser.get(member.id) ?? 0,
        roundPoints: roundPointsByUser.get(member.id) ?? 0,
      }))
      .sort((left, right) => {
        if (right.totalPoints !== left.totalPoints) {
          return right.totalPoints - left.totalPoints;
        }

        return left.name.localeCompare(right.name);
      });

    const topRows = overallLeaderboard.slice(0, 5);
    const leaderboardLines =
      topRows.length > 0
        ? topRows.map((entry, index) => {
            const roundPointsLabel =
              entry.roundPoints > 0
                ? ` (+${entry.roundPoints} this round)`
                : entry.roundPoints < 0
                  ? ` (${entry.roundPoints} this round)`
                  : " (+0 this round)";

            return `${index + 1}. ${entry.name} — ${entry.totalPoints} pts total${roundPointsLabel}`;
          })
        : ["No leaderboard results are available yet."];

    const roundScoringLines = overallLeaderboard
      .filter((entry) => entry.roundPoints !== 0)
      .slice(0, 5)
      .map(
        (entry) =>
          `${entry.name} ${entry.roundPoints > 0 ? `+${entry.roundPoints}` : entry.roundPoints} this round`
      );

    const subject = `Leaderboard update: ${selectedRound.title}`;
    const body = [
      "Hey islanders,",
      "",
      `The leaderboard has been updated for ${selectedRound.title}.`,
      "",
      "Current overall top spots:",
      ...leaderboardLines,
      ...(roundScoringLines.length > 0
        ? ["", "Biggest point swings from this round:", ...roundScoringLines]
        : []),
      "",
      "Check the full leaderboard here:",
      `${window.location.origin}/leaderboard`,
      "",
      "See you in the villa,",
      "Ramya",
    ].join("\n");

    openNotificationDraft({
      kind: "leaderboard",
      roundTitle: selectedRound.title,
      recipients: recipientEmails,
      subject,
      body,
    });
  };

  const notifyPlayersAboutSoftwareChange = () => {
    const recipientEmails = getRecipientEmails();

    if (!recipientEmails) {
      return;
    }

    if (!softwareUpdateTitle.trim() || !softwareUpdateBody.trim()) {
      setErrorMessage("Add both a software update title and message before drafting the email.");
      setSuccessMessage("");
      return;
    }

    const subject = `Love Island League update: ${softwareUpdateTitle.trim()}`;
    const body = [
      "Hey islanders,",
      "",
      softwareUpdateBody.trim(),
      "",
      "Jump back in here:",
      `${window.location.origin}/`,
      "",
      "See you in the villa,",
      "Ramya",
    ].join("\n");

    openNotificationDraft({
      kind: "software",
      roundTitle: softwareUpdateTitle.trim(),
      recipients: recipientEmails,
      subject,
      body,
    });
  };

  const copyNotificationValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setSuccessMessage(`${label} copied.`);
      setErrorMessage("");
    } catch {
      setErrorMessage(`Unable to copy ${label.toLowerCase()} automatically.`);
      setSuccessMessage("");
    }
  };

  if (!loading && !isUnlocked) {
    return (
      <main className="min-h-screen bg-black px-6 py-10 text-zinc-100">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
          <section className="rounded-[2rem] border border-pink-500/25 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-pink-400">
              Protected Admin
            </p>
            <h1 className="mt-3 text-4xl font-semibold">Villa control room</h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-zinc-400">
              This page is password protected. Enter the admin password to manage
              contestants, rounds, actual couples, and scoring.
            </p>
          </section>

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

          <section className="rounded-[2rem] border border-sky-400/25 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-2xl font-semibold">Unlock admin</h2>
            <div className="mt-6 flex flex-col gap-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Password
                <input
                  type="password"
                  value={adminPassword}
                  onChange={(event) => setAdminPassword(event.target.value)}
                  placeholder="Enter admin password"
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-yellow-300"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleAdminUnlock}
                  className="rounded-full bg-gradient-to-r from-pink-500 via-sky-400 to-yellow-300 px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110"
                >
                  Enter admin
                </button>
                <Link
                  href="/"
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
                >
                  Back home
                </Link>
              </div>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="rounded-[2rem] border border-pink-500/25 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-pink-400">
                Admin
              </p>
              <h1 className="mt-3 text-4xl font-semibold">League controls</h1>
              <p className="mt-3 text-sm text-zinc-400">
                Add contestants, open rounds, enter real couples, and trigger scoring.
              </p>
            </div>
            <Link
              href="/"
              className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Back home
            </Link>
          </div>
        </div>

        {loading ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <p className="text-zinc-400">Loading admin tools...</p>
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

        <section className="rounded-[2rem] border border-sky-400/20 bg-zinc-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Player alerts</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Players can save an optional email on the home page. Use the round buttons below to draft a new round announcement in your email app.
              </p>
            </div>
            <div className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100">
              {leagueMembers.filter((member) => member.email).length} saved email
              {leagueMembers.filter((member) => member.email).length === 1 ? "" : "s"}
            </div>
          </div>
        </section>

        {notificationDraft ? (
          <section className="rounded-[2rem] border border-sky-400/20 bg-zinc-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Notification draft</h2>
                <p className="mt-2 text-sm text-zinc-400">
                  {notificationDraft.kind === "round"
                    ? "Prediction round"
                    : notificationDraft.kind === "leaderboard"
                      ? "Leaderboard"
                      : "Software update"}{" "}
                  email prepared for{" "}
                  <span className="font-semibold text-zinc-200">{notificationDraft.roundTitle}</span>.
                  {" "}If your mail app did not open, copy the pieces below.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => copyNotificationValue(notificationDraft.recipients.join(", "), "Recipients")}
                  className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20"
                >
                  Copy recipients
                </button>
                <button
                  type="button"
                  onClick={() => copyNotificationValue(notificationDraft.subject, "Subject")}
                  className="rounded-full border border-pink-400/30 bg-pink-500/10 px-4 py-2 text-sm font-semibold text-pink-100 transition hover:border-pink-300 hover:bg-pink-500/20"
                >
                  Copy subject
                </button>
                <button
                  type="button"
                  onClick={() => copyNotificationValue(notificationDraft.body, "Email body")}
                  className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-4 py-2 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200 hover:bg-yellow-300/20"
                >
                  Copy body
                </button>
                <a
                  href={notificationDraft.mailtoLink}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
                >
                  Open mail app
                </a>
              </div>
            </div>

            <div className="mt-5 grid gap-4">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Recipients</p>
                <p className="mt-2 break-all text-sm text-zinc-200">
                  {notificationDraft.recipients.join(", ")}
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Subject</p>
                <p className="mt-2 text-sm text-zinc-200">{notificationDraft.subject}</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Body</p>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-sm leading-7 text-zinc-200">
                  {notificationDraft.body}
                </pre>
              </div>
            </div>
          </section>
        ) : null}

        <section className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-[2rem] border border-pink-500/20 bg-zinc-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-semibold">Prediction round alerts</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Draft a “new round is live” email straight from any round card below.
            </p>
          </div>

          <div className="rounded-[2rem] border border-sky-400/20 bg-zinc-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-semibold">Leaderboard alerts</h2>
            <p className="mt-2 text-sm text-zinc-400">
              End-of-day update for who climbed, crashed, or called the episode best.
            </p>
            <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-zinc-300">
              Round
              <select
                value={leaderboardRoundId}
                onChange={(event) => setLeaderboardRoundId(event.target.value)}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-sky-400"
              >
                <option value="">Select a round</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.title} ({round.status})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={notifyPlayersAboutLeaderboard}
              className="mt-4 rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-300"
            >
              Notify leaderboard update
            </button>
          </div>

          <div className="rounded-[2rem] border border-yellow-300/20 bg-zinc-950 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-semibold">Software change alerts</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Let the league know when you add features, fix bugs, or change how the game works.
            </p>
            <div className="mt-4 space-y-3">
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Update title
                <input
                  value={softwareUpdateTitle}
                  onChange={(event) => setSoftwareUpdateTitle(event.target.value)}
                  placeholder="New prediction flow is live"
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-yellow-300"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Update message
                <textarea
                  value={softwareUpdateBody}
                  onChange={(event) => setSoftwareUpdateBody(event.target.value)}
                  placeholder="We added real UIs for elimination, bombshell, and leaderboard round updates..."
                  rows={5}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-yellow-300"
                />
              </label>
              <button
                type="button"
                onClick={notifyPlayersAboutSoftwareChange}
                className="rounded-full bg-yellow-300 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-200"
              >
                Notify software change
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-[2rem] border border-pink-500/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-semibold">Add contestant</h2>
            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Contestant name
                <input
                  value={contestantName}
                  onChange={(event) => setContestantName(event.target.value)}
                  placeholder="Enter contestant name"
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-pink-400"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Image path
                <input
                  value={contestantImageUrl}
                  onChange={(event) => setContestantImageUrl(event.target.value)}
                  placeholder="/islanders/jane-doe.webp"
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
                />
                <span className="text-xs text-zinc-500">
                  Optional. Drop the image in `public/islanders` and paste the path here.
                </span>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Status
                <select
                  value={newContestantStatus}
                  onChange={(event) => setNewContestantStatus(event.target.value)}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                >
                  <option value="active">active</option>
                  <option value="eliminated">eliminated</option>
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Contestant type
                <select
                  value={newContestantType}
                  onChange={(event) => setNewContestantType(event.target.value)}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-sky-400"
                >
                  {contestantTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={addContestant}
                className="rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
              >
                Add contestant
              </button>
            </div>
          </div>

          <div className="rounded-[2rem] border border-yellow-300/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-semibold">Create round</h2>
            <div className="mt-4 space-y-4">
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Round title
                <input
                  value={roundTitle}
                  onChange={(event) => setRoundTitle(event.target.value)}
                  placeholder="Week 1 couples"
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-pink-400"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Prediction type
                <select
                  value={predictionType}
                  onChange={(event) => {
                    const nextPredictionType = event.target.value;
                    setPredictionType(nextPredictionType);
                    if (nextPredictionType !== "bombshell_arrival_prediction") {
                      setSelectedBombshellContestantIds([]);
                    }
                    if (
                      isQuestionChallengePrediction(nextPredictionType) &&
                      questionPrompts.every((prompt) => prompt.trim() === "")
                    ) {
                      setQuestionPrompts([createEmptyQuestionPrompt(), createEmptyQuestionPrompt()]);
                    }
                  }}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                >
                  {predictionTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              {predictionType === "bombshell_arrival_prediction" ? (
                <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                  Which bombshells are in this round?
                  <BombshellSelectorGroup
                    contestants={activeContestants}
                    selectedIds={selectedBombshellContestantIds}
                    onToggle={(contestantId) =>
                      setSelectedBombshellContestantIds((currentValue) =>
                        toggleContestantId(currentValue, contestantId)
                      )
                    }
                  />
                  <span className="text-xs text-zinc-500">
                    Pick one or more bombshells. Players will get one target question per bombshell.
                  </span>
                </label>
              ) : null}
              {isQuestionChallengePrediction(predictionType) ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-zinc-300">
                      Question prompts
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setQuestionPrompts((currentValue) => [
                          ...currentValue,
                          createEmptyQuestionPrompt(),
                        ])
                      }
                      className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20"
                    >
                      Add question
                    </button>
                  </div>
                  {questionPrompts.map((prompt, index) => (
                    <div
                      key={`question-prompt-${index + 1}`}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-zinc-200">
                          Question {index + 1}
                        </p>
                        {questionPrompts.length > 1 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setQuestionPrompts((currentValue) =>
                                currentValue.filter((_, currentIndex) => currentIndex !== index)
                              )
                            }
                            className="text-sm font-medium text-zinc-500 transition hover:text-zinc-300"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                      <textarea
                        value={prompt}
                        onChange={(event) =>
                          setQuestionPrompts((currentValue) =>
                            currentValue.map((currentPrompt, currentIndex) =>
                              currentIndex === index ? event.target.value : currentPrompt
                            )
                          )
                        }
                        rows={3}
                        placeholder="Which islander...?"
                        className="w-full rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-zinc-500">
                    Players will answer each question by choosing one islander. Every correct answer is worth 4 points.
                  </p>
                </div>
              ) : null}
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 text-sm text-zinc-300">
                <p>
                  <span className="font-semibold">Selected:</span>{" "}
                  {getPredictionTypeLabel(predictionType)}
                </p>
                {predictionType === "bombshell_arrival_prediction" ? (
                  <p className="mt-1 text-zinc-400">
                    Bombshell focus:{" "}
                    {selectedBombshellContestantIds.length > 0
                      ? selectedBombshellContestantIds
                          .map((contestantId) =>
                            getContestantDisplayName(contestants, contestantId)
                          )
                          .join(", ")
                      : "Not set"}
                  </p>
                ) : null}
                <p className="mt-1 text-zinc-400">
                  Points available: {predictionTypeHasPoints(predictionType) ? "Yes" : "No"}
                </p>
                <p className="mt-2 text-zinc-400">
                  {getPredictionTypeDescription(predictionType)}
                </p>
              </div>
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Status
                <select
                  value={roundStatus}
                  onChange={(event) => setRoundStatus(event.target.value)}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                >
                  <option value="open">open</option>
                  <option value="locked">locked</option>
                  <option value="scored">scored</option>
                </select>
              </label>
              <button
                type="button"
                onClick={createRound}
                className="rounded-full bg-yellow-300 px-5 py-3 text-sm font-semibold text-black transition hover:bg-yellow-200"
              >
                Create round
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-sky-400/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <h2 className="text-xl font-semibold">Update contestants</h2>
          {contestants.length > 0 ? (
            <div className="mt-4 space-y-3">
              {contestants.map((contestant) => (
                <div
                  key={contestant.id}
                  className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-14 w-14 overflow-hidden rounded-full border border-zinc-800 bg-zinc-950">
                      {contestant.image_url ? (
                        <Image
                          src={contestant.image_url}
                          alt={contestant.name}
                          fill
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div>
                      <p className="font-semibold">{contestant.name}</p>
                      <p className="text-sm text-zinc-500">
                        {contestant.status} • {getContestantTypeLabel(contestant.contestant_type)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <select
                      value={contestantStatuses[contestant.id] ?? contestant.status}
                      onChange={(event) =>
                        setContestantStatuses((currentValue) => ({
                          ...currentValue,
                          [contestant.id]: event.target.value,
                        }))
                      }
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                    >
                      <option value="active">active</option>
                      <option value="eliminated">eliminated</option>
                    </select>
                    <select
                      value={contestantTypes[contestant.id] ?? contestant.contestant_type}
                      onChange={(event) =>
                        setContestantTypes((currentValue) => ({
                          ...currentValue,
                          [contestant.id]: event.target.value,
                        }))
                      }
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-sky-400"
                    >
                      {contestantTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => updateContestantProfile(contestant.id)}
                      className="rounded-full border border-zinc-700 bg-zinc-950 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-pink-400 hover:text-pink-300"
                    >
                      Save contestant
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-zinc-400">No contestants added yet.</p>
          )}
        </section>

        <section className="rounded-[2rem] border border-emerald-400/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Villa tracker by round</h2>
              <p className="mt-2 text-sm text-zinc-400">
                Manually set each islander as coupled, single and vulnerable, not in villa, or dumped for a specific day/round.
              </p>
            </div>
            <button
              type="button"
              onClick={saveTrackerEntries}
              className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-emerald-300"
            >
              Save tracker board
            </button>
          </div>

          <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-zinc-300">
            Round
            <select
              value={selectedTrackerRoundId}
              onChange={(event) => setSelectedTrackerRoundId(event.target.value)}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-emerald-400"
            >
              <option value="">Select a round</option>
              {rounds.map((round) => (
                <option key={round.id} value={round.id}>
                  {round.title} ({round.status})
                </option>
              ))}
            </select>
          </label>

          {selectedTrackerRound ? (
            <div className="mt-6 space-y-3">
              {contestants.map((contestant) => (
                <div
                  key={`tracker-${selectedTrackerRound.id}-${contestant.id}`}
                  className="grid gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 lg:grid-cols-[1.1fr_0.75fr_0.95fr]"
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-full border border-zinc-800 bg-zinc-950">
                      {contestant.image_url ? (
                        <Image
                          src={contestant.image_url}
                          alt={contestant.name}
                          fill
                          className="object-cover"
                        />
                      ) : null}
                    </div>
                    <div>
                      <p className="font-semibold text-zinc-100">{contestant.name}</p>
                      <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">
                        {getContestantTypeLabel(contestant.contestant_type)}
                      </p>
                    </div>
                  </div>

                  <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                    State
                    <select
                      value={trackerStatesByContestantId[contestant.id] ?? ""}
                      onChange={(event) =>
                        setTrackerStatesByContestantId((currentValue) => ({
                          ...currentValue,
                          [contestant.id]: event.target.value,
                        }))
                      }
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-emerald-400"
                    >
                      <option value="">Leave auto / blank</option>
                      <option value="coupled">In a couple</option>
                      <option value="single">Single and vulnerable</option>
                      <option value="not_in_villa">Not in villa</option>
                      <option value="dumped">Dumped</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                    Partner
                    <select
                      value={trackerPartnersByContestantId[contestant.id] ?? ""}
                      onChange={(event) =>
                        setTrackerPartnersByContestantId((currentValue) => ({
                          ...currentValue,
                          [contestant.id]: event.target.value,
                        }))
                      }
                      disabled={trackerStatesByContestantId[contestant.id] !== "coupled"}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition disabled:cursor-not-allowed disabled:opacity-50 focus:border-sky-400"
                    >
                      <option value="">Select partner</option>
                      {contestants
                        .filter((otherContestant) => otherContestant.id !== contestant.id)
                        .map((otherContestant) => (
                          <option key={otherContestant.id} value={otherContestant.id}>
                            {otherContestant.name}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-zinc-400">Choose a round to start editing the villa board.</p>
          )}
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-pink-500/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Enter actual round results</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Save the real outcome for the selected round before running scoring.
                </p>
              </div>
              {selectedActualRound && isRecouplingPrediction(selectedActualRound.prediction_type) ? (
                <button
                  type="button"
                  onClick={addActualCoupleRow}
                  className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-pink-400 hover:text-pink-300"
                >
                  Add couple
                </button>
              ) : null}
            </div>

            <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-zinc-300">
              Round
              <select
                value={selectedActualRoundId}
                onChange={(event) => setSelectedActualRoundId(event.target.value)}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
              >
                <option value="">Select a round</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.title} ({round.status})
                  </option>
                ))}
              </select>
            </label>

            {selectedActualRound && isRecouplingPrediction(selectedActualRound.prediction_type) ? (
              <>
                <div className="mt-4 space-y-4">
                  {actualCoupleRows.map((row, index) => (
                    <div
                      key={row.rowId}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                    >
                      <p className="mb-3 text-sm font-semibold text-zinc-300">
                        Actual couple {index + 1}
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <select
                          value={row.contestant1Id}
                          onChange={(event) =>
                            updateActualCoupleRow(row.rowId, "contestant1Id", event.target.value)
                          }
                          className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                        >
                          <option value="">Select contestant 1</option>
                          {contestants.map((contestant) => (
                            <option key={contestant.id} value={contestant.id}>
                              {contestant.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={row.contestant2Id}
                          onChange={(event) =>
                            updateActualCoupleRow(row.rowId, "contestant2Id", event.target.value)
                          }
                          className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                        >
                          <option value="">Select contestant 2</option>
                          {contestants.map((contestant) => (
                            <option key={contestant.id} value={contestant.id}>
                              {contestant.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={saveActualCouples}
                  className="mt-6 rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
                >
                  Save actual couples
                </button>
              </>
            ) : null}

            {selectedActualRound?.prediction_type === "elimination_prediction" ? (
              <div className="mt-4 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                  Dumped islander
                  <select
                    value={actualDumpedContestantId}
                    onChange={(event) => setActualDumpedContestantId(event.target.value)}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
                  >
                    <option value="">Select who actually got dumped</option>
                    {contestants.map((contestant) => (
                      <option key={contestant.id} value={contestant.id}>
                        {contestant.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                  Bottom group survivor
                  <select
                    value={actualBottomGroupContestantId}
                    onChange={(event) => setActualBottomGroupContestantId(event.target.value)}
                    className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-yellow-300"
                  >
                    <option value="">Optional partial-credit result</option>
                    {contestants.map((contestant) => (
                      <option key={contestant.id} value={contestant.id}>
                        {contestant.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={saveEliminationResults}
                  className="rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
                >
                  Save elimination results
                </button>
              </div>
            ) : null}

            {selectedActualRound?.prediction_type === "bombshell_arrival_prediction" ? (
              <div className="mt-4 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm text-sky-200">
                  Bombshell focus:{" "}
                  <span className="font-semibold">
                    {selectedActualRoundBombshellIds.length > 0
                      ? selectedActualRoundBombshellIds
                          .map((contestantId) =>
                            getContestantDisplayName(contestants, contestantId)
                          )
                          .join(", ")
                      : "Not set"}
                  </span>
                </p>
                {selectedActualRoundBombshellIds.map((bombshellId) => (
                  <label
                    key={bombshellId}
                    className="flex flex-col gap-2 text-sm font-medium text-zinc-300"
                  >
                    Who did {getContestantDisplayName(contestants, bombshellId)} actually go after?
                    <select
                      value={actualBombshellTargetIdsByBombshell[bombshellId] ?? ""}
                      onChange={(event) =>
                        setActualBombshellTargetIdsByBombshell((currentValue) => ({
                          ...currentValue,
                          [bombshellId]: event.target.value,
                        }))
                      }
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-sky-400"
                    >
                      <option value="">Select the actual target</option>
                      {contestants.map((contestant) => (
                        <option key={contestant.id} value={contestant.id}>
                          {contestant.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <button
                  type="button"
                  onClick={saveBombshellResults}
                  disabled={selectedActualRoundBombshellIds.length === 0}
                  className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-200"
                >
                  Save bombshell results
                </button>
              </div>
            ) : null}

            {isQuestionChallengePrediction(selectedActualRound?.prediction_type ?? "") ? (
              <div className="mt-4 space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                {(roundQuestionsByRoundId[selectedActualRoundId] ?? []).length > 0 ? (
                  (roundQuestionsByRoundId[selectedActualRoundId] ?? []).map((question, index) => (
                    <label
                      key={question.id}
                      className="flex flex-col gap-2 text-sm font-medium text-zinc-300"
                    >
                      Question {index + 1}: {question.question_text}
                      <select
                        value={actualQuestionAnswerIdsByQuestion[question.id] ?? ""}
                        onChange={(event) =>
                          setActualQuestionAnswerIdsByQuestion((currentValue) => ({
                            ...currentValue,
                            [question.id]: event.target.value,
                          }))
                        }
                        className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-sky-400"
                      >
                        <option value="">Select the correct islander</option>
                        {contestants.map((contestant) => (
                          <option key={contestant.id} value={contestant.id}>
                            {contestant.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-zinc-400">
                    No question prompts were saved for this round yet.
                  </p>
                )}
                <button
                  type="button"
                  onClick={saveQuestionChallengeResults}
                  disabled={(roundQuestionsByRoundId[selectedActualRoundId] ?? []).length === 0}
                  className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-200"
                >
                  Save question challenge answers
                </button>
              </div>
            ) : null}

            {selectedActualRound &&
            !isRecouplingPrediction(selectedActualRound.prediction_type) &&
            selectedActualRound.prediction_type !== "elimination_prediction" &&
            selectedActualRound.prediction_type !== "bombshell_arrival_prediction" &&
            !isQuestionChallengePrediction(selectedActualRound.prediction_type) ? (
              <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                This round type does not use an actual-results form right now.
              </div>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-sky-400/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-xl font-semibold">Run scoring</h2>
            <p className="mt-2 text-sm text-zinc-400">
              Initial coupling, recoupling, elimination, bombshell, and question challenge rounds can all be scored here once results are saved.
            </p>
            <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-zinc-300">
              Round
              <select
                value={scoringRoundId}
                onChange={(event) => setScoringRoundId(event.target.value)}
                className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition focus:border-pink-400"
              >
                <option value="">Select a round</option>
                {rounds.map((round) => (
                  <option key={round.id} value={round.id}>
                    {round.title} ({round.status})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={scoreRound}
              className="mt-6 rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-300"
            >
              Run scoring
            </button>
          </div>
        </section>

        <section className="rounded-[2rem] border border-yellow-300/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <h2 className="text-xl font-semibold">Episode recap editor</h2>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-zinc-400">
            Add one sharp recap paragraph per round so the homepage reads like a quick-hit episode
            diary. Think punchy, dramatic, and short enough to scan in one breath.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
              <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Round / episode
                <select
                  value={recapRoundId}
                  onChange={(event) => setRecapRoundId(event.target.value)}
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition focus:border-sky-400"
                >
                  <option value="">Select a round</option>
                  {rounds.map((round) => (
                    <option key={round.id} value={round.id}>
                      {round.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Optional headline
                <input
                  type="text"
                  value={recapHeadline}
                  onChange={(event) => setRecapHeadline(event.target.value)}
                  placeholder="The villa finally cracked"
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
                />
              </label>

              <label className="mt-4 flex flex-col gap-2 text-sm font-medium text-zinc-300">
                Recap paragraph
                <textarea
                  value={recapText}
                  onChange={(event) => setRecapText(event.target.value)}
                  rows={6}
                  maxLength={650}
                  placeholder="One paragraph with the main mess: who coupled up, who spiraled, who got pulled for chats, and what twist set tomorrow on fire."
                  className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
                />
              </label>

              <p className="mt-3 text-xs text-zinc-500">
                Keep it to one paragraph. Current length: {recapText.trim().length} characters.
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={saveEpisodeRecap}
                  className="rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-black transition hover:bg-sky-300"
                >
                  Save recap
                </button>
                {episodeRecaps.some((recap) => recap.round_id === recapRoundId) ? (
                  <button
                    type="button"
                    onClick={() => deleteEpisodeRecap(recapRoundId)}
                    className="rounded-full border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-500/20"
                  >
                    Delete recap
                  </button>
                ) : null}
              </div>
            </div>

            <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Saved recaps
              </p>
              {episodeRecaps.length > 0 ? (
                <div className="mt-4 space-y-3">
                  {episodeRecaps.map((recap) => (
                    <article
                      key={recap.id}
                      className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-4"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                        {rounds.find((round) => round.id === recap.round_id)?.title ?? "Episode"}
                      </p>
                      <h3 className="mt-2 text-lg font-semibold text-zinc-100">
                        {recap.headline?.trim() ||
                          rounds.find((round) => round.id === recap.round_id)?.title ||
                          "Episode recap"}
                      </h3>
                      <p className="mt-3 text-sm leading-7 text-zinc-300">{recap.recap_text}</p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-zinc-400">
                  No episode recaps saved yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-yellow-300/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <h2 className="text-xl font-semibold">Existing rounds</h2>
          {rounds.length > 0 ? (
            <div className="mt-4 space-y-3">
              {rounds.map((round) => (
                <div
                  key={round.id}
                  className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className="font-semibold">{round.title}</p>
                      <p className="text-sm text-zinc-400">
                        {getPredictionTypeLabel(round.prediction_type)} • {round.status} • points {predictionTypeHasPoints(round.prediction_type) ? "on" : "off"}
                      </p>
                      {round.prediction_type === "bombshell_arrival_prediction" ? (
                        <p className="mt-2 text-sm text-sky-200">
                          Bombshell focus:{" "}
                          <span className="font-semibold">
                            {(roundBombshellSelections[round.id]?.length
                              ? roundBombshellSelections[round.id]
                              : round.bombshell_contestant_id
                                ? [round.bombshell_contestant_id]
                                : []
                            )
                              .map((contestantId) =>
                                getContestantDisplayName(contestants, contestantId)
                              )
                              .join(", ") || "Not set"}
                          </span>
                        </p>
                      ) : null}
                      <p className="mt-2 text-sm text-zinc-500">
                        {getPredictionTypeDescription(round.prediction_type)}
                      </p>
                      {isQuestionChallengePrediction(round.prediction_type) &&
                      (roundQuestionsByRoundId[round.id] ?? []).length > 0 ? (
                        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                            Questions
                          </p>
                          <div className="mt-3 space-y-2 text-sm text-zinc-300">
                            {(roundQuestionsByRoundId[round.id] ?? []).map((question, index) => (
                              <p key={question.id}>
                                {index + 1}. {question.question_text}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {round.prediction_type === "bombshell_arrival_prediction" ? (
                        <div className="mt-4 flex flex-col gap-2 sm:max-w-sm">
                          <label className="text-sm font-medium text-zinc-300">
                            Which bombshells are in this round?
                          </label>
                          <BombshellSelectorGroup
                            contestants={activeContestants}
                            selectedIds={roundBombshellSelections[round.id] ?? []}
                            onToggle={(contestantId) =>
                              setRoundBombshellSelections((currentValue) => ({
                                ...currentValue,
                                [round.id]: toggleContestantId(
                                  currentValue[round.id] ?? [],
                                  contestantId
                                ),
                              }))
                            }
                          />
                          <button
                            type="button"
                            onClick={() => saveRoundBombshellSelection(round.id)}
                            className="w-fit rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20"
                          >
                            Save bombshell lineup
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {round.status === "open" ? (
                        <button
                          type="button"
                          onClick={() => updateRoundStatus(round.id, "locked")}
                          className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-4 py-2 text-sm font-semibold text-yellow-100 transition hover:border-yellow-200 hover:bg-yellow-300/20"
                        >
                          Close round
                        </button>
                      ) : round.status === "locked" ? (
                        <button
                          type="button"
                          onClick={() => updateRoundStatus(round.id, "open")}
                          className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/20"
                        >
                          Reopen round
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => notifyPlayersAboutRound(round)}
                        className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20"
                      >
                        Notify players
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRound(round.id)}
                        className="rounded-full border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-200 transition hover:border-red-400 hover:bg-red-500/20"
                      >
                        Delete round
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-zinc-400">No rounds created yet.</p>
          )}
        </section>

        <section className="flex flex-wrap gap-3">
          <Link
            href="/dashboard"
            className="rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
          >
            Dashboard
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-pink-400 hover:text-pink-300"
          >
            View leaderboard
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
