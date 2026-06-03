"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredLeagueUser, type LeagueUser as StoredLeagueUser } from "@/lib/leagueUser";
import { getPredictionTypeLabel, isRecouplingPrediction } from "@/lib/predictionTypes";
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
  bombshell_contestant_id: string;
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

type ActualCouple = {
  round_id: string;
  contestant_1_id: string;
  contestant_2_id: string;
};

type RoundResult = {
  round_id: string;
  result_type: string;
  bombshell_contestant_id?: string | null;
  contestant_id: string | null;
};

type LeaderboardEntry = {
  user_id: string;
  name: string;
  totalPoints: number;
};

type RoundResultSummary = {
  roundId: string;
  roundTitle: string;
  predictionType: string;
  status: string;
  resultSummary: string;
  playerPoints: number;
};

function describeRoundResults(
  round: Round,
  contestantsById: Map<string, string>,
  actualCouples: ActualCouple[],
  roundResults: RoundResult[],
  roundBombshellMap: Map<string, string[]>
) {
  if (isRecouplingPrediction(round.prediction_type)) {
    const couples = actualCouples
      .filter((couple) => couple.round_id === round.id)
      .map((couple) => {
        const firstName = contestantsById.get(couple.contestant_1_id) ?? "Unknown";
        const secondName = contestantsById.get(couple.contestant_2_id) ?? "Unknown";
        return `${firstName} + ${secondName}`;
      });

    return couples.length > 0 ? couples.join(" • ") : "No actual couples entered yet.";
  }

  if (round.prediction_type === "elimination_prediction") {
    const dumpedId =
      roundResults.find(
        (result) => result.round_id === round.id && result.result_type === "dumped_pick"
      )?.contestant_id ?? null;
    const bottomGroupId =
      roundResults.find(
        (result) => result.round_id === round.id && result.result_type === "bottom_group_pick"
      )?.contestant_id ?? null;

    const dumpedName = dumpedId ? contestantsById.get(dumpedId) ?? "Unknown" : "Not set";
    const bottomGroupName = bottomGroupId
      ? contestantsById.get(bottomGroupId) ?? "Unknown"
      : "Not set";

    return `Dumped: ${dumpedName} • Bottom group: ${bottomGroupName}`;
  }

  if (round.prediction_type === "bombshell_arrival_prediction") {
    const bombshellIds = roundBombshellMap.get(round.id)?.length
      ? roundBombshellMap.get(round.id) ?? []
      : round.bombshell_contestant_id
        ? [round.bombshell_contestant_id]
        : [];

    if (bombshellIds.length === 0) {
      return "No bombshell focus set yet.";
    }

    return bombshellIds
      .map((bombshellId) => {
        const targetId =
          roundResults.find(
            (result) =>
              result.round_id === round.id &&
              result.result_type === "target_pick" &&
              result.bombshell_contestant_id === bombshellId
          )?.contestant_id ?? null;
        const bombshellName = contestantsById.get(bombshellId) ?? "Unknown";
        const targetName = targetId ? contestantsById.get(targetId) ?? "Unknown" : "Not set";

        return `${bombshellName} went after ${targetName}`;
      })
      .join(" • ");
  }

  return "No results summary for this round type.";
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
        { data: roundBombshellData, error: roundBombshellError },
        { data: contestantData, error: contestantError },
        { data: actualCoupleData, error: actualCoupleError },
        { data: roundResultsData, error: roundResultsError },
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
          .from("round_bombshells")
          .select("round_id, bombshell_contestant_id"),
        supabase.from("contestants").select("id, name").order("name"),
        supabase
          .from("actual_couples")
          .select("round_id, contestant_1_id, contestant_2_id"),
        supabase
          .from("round_results")
          .select("round_id, result_type, contestant_id, bombshell_contestant_id"),
      ]);

      if (
        scoreError ||
        userError ||
        roundError ||
        roundBombshellError ||
        contestantError ||
        actualCoupleError ||
        roundResultsError
      ) {
        setErrorMessage(
          scoreError?.message ??
            userError?.message ??
            roundError?.message ??
            roundBombshellError?.message ??
            contestantError?.message ??
            actualCoupleError?.message ??
            roundResultsError?.message ??
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
      const roundBombshellMap = ((roundBombshellData ?? []) as RoundBombshellRow[]).reduce<
        Map<string, string[]>
      >((map, row) => {
        map.set(row.round_id, [...(map.get(row.round_id) ?? []), row.bombshell_contestant_id]);
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

      const nextRoundResultSummaries = ((roundData ?? []) as Round[]).map((round) => ({
        roundId: round.id,
        roundTitle: round.title,
        predictionType: round.prediction_type,
        status: round.status,
        resultSummary: describeRoundResults(
          round,
          contestantsById,
          (actualCoupleData ?? []) as ActualCouple[],
          (roundResultsData ?? []) as RoundResult[],
          roundBombshellMap
        ),
        playerPoints: pointsByRound.get(round.id) ?? 0,
      }));

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
                          {getPredictionTypeLabel(summary.predictionType)} • {summary.status}
                        </p>
                      </div>
                      <div className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100">
                        {summary.playerPoints} points for you
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-zinc-300">{summary.resultSummary}</p>
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
            Open villa chat
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
