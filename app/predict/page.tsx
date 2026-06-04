"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredLeagueUser, type LeagueUser } from "@/lib/leagueUser";
import {
  getPredictionTypeDescription,
  getPredictionTypeLabel,
  isNoScoreEpisode,
  isRecouplingPrediction,
} from "@/lib/predictionTypes";
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
};

type RoundBombshellRow = {
  round_id: string;
  bombshell_contestant_id: string;
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
  prediction_role: string | null;
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

function getBombshellIdsForRound(
  round: Round | null,
  roundBombshellMap: Record<string, string[]>
) {
  if (!round) {
    return [];
  }

  if (roundBombshellMap[round.id]?.length) {
    return roundBombshellMap[round.id];
  }

  return round.bombshell_contestant_id ? [round.bombshell_contestant_id] : [];
}

function formatSavedPredictionSummary(
  round: Round | null,
  contestants: Contestant[],
  predictions: StoredPrediction[],
  roundBombshellMap: Record<string, string[]>
) {
  if (!round || predictions.length === 0) {
    return "No saved predictions yet for this round.";
  }

  if (isRecouplingPrediction(round.prediction_type)) {
    const pairs = predictions
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

    return pairs.length > 0 ? pairs.join(" • ") : "No couples saved yet.";
  }

  if (round.prediction_type === "elimination_prediction") {
    const dumpedPick = predictions.find((prediction) => prediction.prediction_role === "dumped_pick");
    const bottomGroupPick = predictions.find(
      (prediction) => prediction.prediction_role === "bottom_group_pick"
    );

    return [
      `Dumped: ${getContestantName(contestants, dumpedPick?.contestant_1_id ?? "")}`,
      `Danger: ${bottomGroupPick?.contestant_1_id ? getContestantName(contestants, bottomGroupPick.contestant_1_id) : "No pick"}`,
    ].join(" • ");
  }

  if (round.prediction_type === "bombshell_arrival_prediction") {
    const bombshellIds = getBombshellIdsForRound(round, roundBombshellMap);

    if (bombshellIds.length === 0) {
      return "Admin still needs to choose which bombshells this round is about.";
    }

    return bombshellIds
      .map((bombshellId) => {
        const targetPrediction = predictions.find(
          (prediction) =>
            prediction.prediction_role === "target_pick" &&
            prediction.bombshell_contestant_id === bombshellId
        );

        return `${getContestantName(contestants, bombshellId)} -> ${getContestantName(
          contestants,
          targetPrediction?.contestant_1_id ?? ""
        )}`;
      })
      .join(" • ");
  }

  return "This round does not use saved predictions.";
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

export default function PredictPage() {
  const [user, setUser] = useState<LeagueUser | null>(null);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [openRounds, setOpenRounds] = useState<Round[]>([]);
  const [selectedRoundId, setSelectedRoundId] = useState("");
  const [rows, setRows] = useState<PredictionFormRow[]>([createEmptyRow(1)]);
  const [nextRowId, setNextRowId] = useState(2);
  const [dumpedPickId, setDumpedPickId] = useState("");
  const [bottomGroupPickId, setBottomGroupPickId] = useState("");
  const [targetPickIdsByBombshell, setTargetPickIdsByBombshell] = useState<Record<string, string>>(
    {}
  );
  const [savedPredictions, setSavedPredictions] = useState<StoredPrediction[]>([]);
  const [savedPredictionUpdatedAt, setSavedPredictionUpdatedAt] = useState<string | null>(null);
  const [roundBombshellMap, setRoundBombshellMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const openRound =
    openRounds.find((round) => round.id === selectedRoundId) ?? openRounds[0] ?? null;
  const activeContestants = contestants.filter((contestant) => contestant.status === "active");
  const contestantOptions =
    openRound?.prediction_type === "bombshell_arrival_prediction" ? contestants : activeContestants;
  const isInitialCouplingRound = openRound?.prediction_type === "initial_coupling_prediction";
  const selectedBombshellIds = getBombshellIdsForRound(openRound, roundBombshellMap);

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
        { data: roundBombshellsData, error: roundBombshellsError },
      ] = await Promise.all([
        supabase
          .from("contestants")
          .select("id, name, status, image_url")
          .order("name"),
        supabase
          .from("rounds")
          .select("id, title, prediction_type, bombshell_contestant_id, status")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .order("title"),
        supabase
          .from("round_bombshells")
          .select("round_id, bombshell_contestant_id"),
      ]);

      if (contestantsError || roundError || roundBombshellsError) {
        setErrorMessage(
          contestantsError?.message ??
            roundError?.message ??
            roundBombshellsError?.message ??
            "Unable to load predictions."
        );
        setLoading(false);
        return;
      }

      setContestants((contestantsData ?? []) as Contestant[]);
      const nextRounds = (roundsData ?? []) as Round[];
      const nextRoundBombshellMap = ((roundBombshellsData ?? []) as RoundBombshellRow[]).reduce<
        Record<string, string[]>
      >((map, row) => {
        map[row.round_id] = [...(map[row.round_id] ?? []), row.bombshell_contestant_id];
        return map;
      }, {});
      setRoundBombshellMap(nextRoundBombshellMap);
      setOpenRounds(nextRounds);
      setSelectedRoundId((currentValue) => {
        if (currentValue && nextRounds.some((round) => round.id === currentValue)) {
          return currentValue;
        }

        return nextRounds[0]?.id ?? "";
      });

      setLoading(false);
    };

    void loadPredictionPage();
  }, []);

  useEffect(() => {
    const loadExistingPredictions = async () => {
      if (!user || !selectedRoundId) {
        setRows([createEmptyRow(1)]);
        setNextRowId(2);
        setSavedPredictions([]);
        setSavedPredictionUpdatedAt(null);
        return;
      }

      const { data: existingPredictions, error: predictionsError } = await supabase
        .from("predictions")
        .select(
          "contestant_1_id, contestant_2_id, prediction_role, bombshell_contestant_id, created_at"
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

      setDumpedPickId("");
      setBottomGroupPickId("");
      setTargetPickIdsByBombshell({});

      if (openRound && isRecouplingPrediction(openRound.prediction_type)) {
        const couplePredictions = typedPredictions.filter(
          (prediction) =>
            (prediction.prediction_role === "couple_pick" || prediction.prediction_role == null) &&
            prediction.contestant_1_id &&
            prediction.contestant_2_id
        );

        if (couplePredictions.length > 0) {
          setRows(
            couplePredictions.map((prediction, index) => ({
              rowId: index + 1,
              contestant1Id: prediction.contestant_1_id ?? "",
              contestant2Id: prediction.contestant_2_id ?? "",
            }))
          );
          setNextRowId(couplePredictions.length + 1);
        } else {
          setRows([createEmptyRow(1)]);
          setNextRowId(2);
        }
        return;
      }

      if (openRound?.prediction_type === "elimination_prediction") {
        setRows([createEmptyRow(1)]);
        setNextRowId(2);
        setDumpedPickId(
          typedPredictions.find((prediction) => prediction.prediction_role === "dumped_pick")
            ?.contestant_1_id ?? ""
        );
        setBottomGroupPickId(
          typedPredictions.find((prediction) => prediction.prediction_role === "bottom_group_pick")
            ?.contestant_1_id ?? ""
        );
        return;
      }

      if (openRound?.prediction_type === "bombshell_arrival_prediction") {
        setRows([createEmptyRow(1)]);
        setNextRowId(2);
        setTargetPickIdsByBombshell(
          typedPredictions.reduce<Record<string, string>>((map, prediction) => {
            if (
              prediction.prediction_role === "target_pick" &&
              prediction.bombshell_contestant_id &&
              prediction.contestant_1_id
            ) {
              map[prediction.bombshell_contestant_id] = prediction.contestant_1_id;
            }
            return map;
          }, {})
        );
        return;
      }

      setRows([createEmptyRow(1)]);
      setNextRowId(2);
    };

    void loadExistingPredictions();
  }, [selectedRoundId, user]);

  const updateRow = (
    rowId: number,
    field: "contestant1Id" | "contestant2Id",
    value: string
  ) => {
    setRows((currentRows) =>
      currentRows.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row))
    );
  };

  const addRow = () => {
    setRows((currentRows) => [...currentRows, createEmptyRow(nextRowId)]);
    setNextRowId((currentValue) => currentValue + 1);
  };

  const removeRow = (rowId: number) => {
    setRows((currentRows) => {
      const nextRows = currentRows.filter((row) => row.rowId !== rowId);
      return nextRows.length > 0 ? nextRows : [createEmptyRow(nextRowId)];
    });
    if (rows.length === 1) {
      setNextRowId((currentValue) => currentValue + 1);
    }
  };

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

    if (isNoScoreEpisode(openRound.prediction_type)) {
      setSavedPredictions([]);
      setSavedPredictionUpdatedAt(null);
      setSuccessMessage("This is a no-score episode, so there is nothing to save.");
      setSaving(false);
      return;
    }

    let predictionRows:
      | Array<{
          user_id: string;
          round_id: string;
          prediction_role: string;
          contestant_1_id: string;
          contestant_2_id?: string | null;
        }>
      | null = null;

    if (isRecouplingPrediction(openRound.prediction_type)) {
      const completedRows = rows.filter(
        (row) => row.contestant1Id.trim() !== "" && row.contestant2Id.trim() !== ""
      );

      if (completedRows.length === 0) {
        setErrorMessage("Add at least one predicted couple before saving.");
        setSaving(false);
        return;
      }

      if (completedRows.some((row) => row.contestant1Id === row.contestant2Id)) {
        setErrorMessage("A contestant cannot be paired with themselves.");
        setSaving(false);
        return;
      }

      const uniquePairs = new Set(
        completedRows.map((row) => normalizePair(row.contestant1Id, row.contestant2Id))
      );

      if (uniquePairs.size !== completedRows.length) {
        setErrorMessage("Duplicate predicted couples are not allowed.");
        setSaving(false);
        return;
      }

      predictionRows = completedRows.map((row) => ({
        user_id: user.id,
        round_id: openRound.id,
        prediction_role: "couple_pick",
        contestant_1_id: row.contestant1Id,
        contestant_2_id: row.contestant2Id,
      }));
    }

    if (openRound.prediction_type === "elimination_prediction") {
      if (!dumpedPickId) {
        setErrorMessage("Pick who you think gets dumped.");
        setSaving(false);
        return;
      }

      if (bottomGroupPickId && bottomGroupPickId === dumpedPickId) {
        setErrorMessage("Choose a different islander for bottom group danger.");
        setSaving(false);
        return;
      }

      predictionRows = [
        {
          user_id: user.id,
          round_id: openRound.id,
          prediction_role: "dumped_pick",
          contestant_1_id: dumpedPickId,
        },
        ...(bottomGroupPickId
          ? [
              {
                user_id: user.id,
                round_id: openRound.id,
                prediction_role: "bottom_group_pick",
                contestant_1_id: bottomGroupPickId,
              },
            ]
          : []),
      ];
    }

    if (openRound.prediction_type === "bombshell_arrival_prediction") {
      if (selectedBombshellIds.length === 0) {
        setErrorMessage("Admin still needs to choose which bombshells this round is about.");
        setSaving(false);
        return;
      }

      if (selectedBombshellIds.some((bombshellId) => !targetPickIdsByBombshell[bombshellId])) {
        setErrorMessage("Pick a target for each bombshell before saving.");
        setSaving(false);
        return;
      }

      predictionRows = selectedBombshellIds.map((bombshellId) => ({
        user_id: user.id,
        round_id: openRound.id,
        prediction_role: "target_pick",
        bombshell_contestant_id: bombshellId,
        contestant_1_id: targetPickIdsByBombshell[bombshellId],
      }));
    }

    if (!predictionRows || predictionRows.length === 0) {
      setErrorMessage("This round type is not ready to save yet.");
      setSaving(false);
      return;
    }

    const { data: insertedPredictions, error: insertError } = await supabase
      .from("predictions")
      .insert(predictionRows)
      .select(
        "contestant_1_id, contestant_2_id, prediction_role, bombshell_contestant_id, created_at"
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
                    <span className="font-semibold">Prediction type:</span>{" "}
                    {getPredictionTypeLabel(openRound.prediction_type)}
                  </p>
                  <p className="text-sm text-zinc-400">
                    {getPredictionTypeDescription(openRound.prediction_type)}
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
                        {round.title}
                        {round.prediction_type === "bombshell_arrival_prediction"
                          ? getBombshellIdsForRound(round, roundBombshellMap).length > 0
                            ? ` (${getBombshellIdsForRound(round, roundBombshellMap)
                                .map((bombshellId) => getContestantName(contestants, bombshellId))
                                .join(" + ")})`
                            : ` (${getPredictionTypeLabel(round.prediction_type)})`
                          : ` (${getPredictionTypeLabel(round.prediction_type)})`}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {openRound && !isNoScoreEpisode(openRound.prediction_type) ? (
                <div className="mt-5 rounded-2xl border border-blue-500/30 bg-blue-500/8 p-4 text-sm text-blue-100">
                  Your picks auto-load when you switch between open rounds, so you can test each
                  format without losing what you already saved.
                </div>
              ) : null}
              {openRound && !isNoScoreEpisode(openRound.prediction_type) ? (
                <div className="mt-5 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-200/90">
                    Saved for this round
                  </p>
                  <p className="mt-2 text-sm leading-7 text-emerald-50">
                    {formatSavedPredictionSummary(
                      openRound,
                      contestants,
                      savedPredictions,
                      roundBombshellMap
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
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold">
                    {openRound && isRecouplingPrediction(openRound.prediction_type)
                      ? "Predicted couples"
                      : getPredictionTypeLabel(openRound?.prediction_type ?? "Prediction form")}
                  </h2>
                  <p className="mt-1 text-sm text-zinc-400">
                    {openRound && isRecouplingPrediction(openRound.prediction_type)
                      ? "Choose the active contestants you think will couple up."
                      : openRound
                        ? getPredictionTypeDescription(openRound.prediction_type)
                        : "Open a round in admin to start testing predictions."}
                  </p>
                </div>
                {openRound && isRecouplingPrediction(openRound.prediction_type) ? (
                  <button
                    type="button"
                    onClick={addRow}
                    className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-pink-400 hover:text-pink-300"
                  >
                    Add couple
                  </button>
                ) : null}
              </div>

              {openRound && isRecouplingPrediction(openRound.prediction_type) ? (
                <div className="mt-6 space-y-4">
                  {isInitialCouplingRound ? <CastBoard contestants={activeContestants} /> : null}
                  {rows.map((row, index) => (
                    <div
                      key={row.rowId}
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between">
                        <p className="text-sm font-semibold text-zinc-300">
                          Couple {index + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeRow(row.rowId)}
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
                              updateRow(row.rowId, "contestant1Id", event.target.value)
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
                              updateRow(row.rowId, "contestant2Id", event.target.value)
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
              ) : openRound?.prediction_type === "elimination_prediction" ? (
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
                    onSelect={setDumpedPickId}
                  />
                  <ContestantPicker
                    contestants={activeContestants}
                    label="Who lands in danger but survives?"
                    helperText="Optional partial-credit pick for someone who ends up vulnerable without getting dumped."
                    selectedId={bottomGroupPickId}
                    onSelect={setBottomGroupPickId}
                  />
                </div>
              ) : openRound?.prediction_type === "bombshell_arrival_prediction" ? (
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
                      Admin still needs to set which bombshells this round is about before players can lock in picks.
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
                        setTargetPickIdsByBombshell((currentValue) => ({
                          ...currentValue,
                          [bombshellId]: contestantId,
                        }))
                      }
                    />
                  ))}
                </div>
              ) : (
                <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-300">
                  {openRound && isNoScoreEpisode(openRound.prediction_type)
                    ? "This episode is marked as watch-only, so no predictions or points are live."
                    : openRound
                      ? "This round type has its own custom flow above."
                      : "Open a round in admin to start taking predictions."}
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={savePredictions}
                  disabled={
                    saving ||
                    !openRound ||
                    isNoScoreEpisode(openRound.prediction_type) ||
                    (openRound.prediction_type === "bombshell_arrival_prediction" &&
                      selectedBombshellIds.length === 0)
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
