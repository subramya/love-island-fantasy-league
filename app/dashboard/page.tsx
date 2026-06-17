"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  contestantTypeOptions,
  getContestantTypeLabel,
  getContestantTypeStyles,
} from "@/lib/contestantTypes";
import { getStoredLeagueUser, type LeagueUser } from "@/lib/leagueUser";
import { buildFallbackRoundModule, getRoundModuleSummary, sortRoundModules, type RoundModule } from "@/lib/roundModules";
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
  status: string;
};

export default function DashboardPage() {
  const [user, setUser] = useState<LeagueUser | null>(null);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [openRound, setOpenRound] = useState<Round | null>(null);
  const [openRoundModules, setOpenRoundModules] = useState<RoundModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const loadDashboard = async () => {
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
        { data: roundData, error: roundError },
        { data: moduleData, error: moduleError },
        { data: roundResultsData, error: roundResultsError },
      ] = await Promise.all([
        supabase
          .from("contestants")
          .select("id, name, status, contestant_type, image_url")
          .order("name"),
        supabase
          .from("rounds")
          .select("id, title, prediction_type, status")
          .eq("status", "open")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("round_prediction_modules")
          .select("id, round_id, prediction_type, title, sort_order, created_at")
          .order("sort_order")
          .order("created_at"),
        supabase
          .from("round_results")
          .select("contestant_id, result_type"),
      ]);

      if (contestantsError || roundError || moduleError || roundResultsError) {
        setErrorMessage(
          contestantsError?.message ??
            roundError?.message ??
            moduleError?.message ??
            roundResultsError?.message ??
            "Unable to load dashboard."
        );
      } else {
        const nextDumpedContestantIds = Array.from(
          new Set(
            ((roundResultsData ?? []) as Array<{ contestant_id: string | null; result_type: string }>)
              .filter((result) => result.result_type === "dumped_pick" && result.contestant_id)
              .map((result) => result.contestant_id as string)
          )
        );
        setContestants(
          ((contestantsData ?? []) as Contestant[]).filter(
            (contestant) =>
              contestant.status === "active" && !nextDumpedContestantIds.includes(contestant.id)
          )
        );
        const nextRound = (roundData ?? null) as Round | null;
        setOpenRound(nextRound);
        const modules = ((moduleData ?? []) as RoundModule[]).filter(
          (module) => module.round_id === nextRound?.id
        );
        setOpenRoundModules(
          nextRound
            ? modules.length > 0
              ? sortRoundModules(modules)
              : [buildFallbackRoundModule(nextRound)]
            : []
        );
      }

      setLoading(false);
    };

    void loadDashboard();
  }, []);

  return (
    <main className="min-h-screen bg-transparent px-6 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-pink-400">
            Dashboard
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Love Island League</h1>
          <p className="mt-3 text-sm text-zinc-400">
            See the latest contestants, the current prediction round, and jump back into the league.
          </p>
        </div>

        {!loading && !user ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <p className="text-base text-zinc-300">
              Log in from the home page to view your dashboard.
            </p>
            <Link
              href="/"
              className="mt-4 inline-flex rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
            >
              Back to login
            </Link>
          </section>
        ) : null}

        {loading ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <p className="text-zinc-400">Loading your dashboard...</p>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="rounded-3xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
            {errorMessage}
          </section>
        ) : null}

        {user ? (
          <>
            <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <h2 className="text-xl font-semibold">Logged in</h2>
              <p className="mt-2 text-zinc-300">{user.name}</p>
              <p className="mt-1 text-sm text-zinc-500">
                {user.email ? `Round alerts: ${user.email}` : "No alert email saved yet."}
              </p>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <h2 className="text-xl font-semibold">Current open round</h2>
              {openRound ? (
                <div className="mt-3 space-y-2 text-zinc-300">
                  <p>
                    <span className="font-semibold">Title:</span> {openRound.title}
                  </p>
                  <p>
                    <span className="font-semibold">Prediction modules:</span>{" "}
                    {getRoundModuleSummary(openRoundModules)}
                  </p>
                  <p>
                    <span className="font-semibold">Status:</span> {openRound.status}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-zinc-400">No open round is available right now.</p>
              )}
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <h2 className="text-xl font-semibold">Active contestants</h2>
              {contestants.length > 0 ? (
                <>
                  <div className="mt-4 overflow-hidden rounded-3xl border border-zinc-800">
                    <div className="grid grid-cols-[minmax(0,1.6fr)_auto_auto] gap-4 border-b border-zinc-800 bg-zinc-900/90 px-5 py-4 text-xs font-semibold uppercase tracking-[0.22em] text-zinc-400">
                      <p>Islander</p>
                      <p>Status</p>
                      <p>Type</p>
                    </div>
                    {contestants.map((contestant) => {
                      const typeStyles = getContestantTypeStyles(contestant.contestant_type);

                      return (
                        <div
                          key={contestant.id}
                          className={`grid grid-cols-[minmax(0,1.6fr)_auto_auto] gap-4 border-b border-zinc-800/80 px-5 py-4 last:border-b-0 ${typeStyles.rowClassName}`}
                        >
                          <div className="flex min-w-0 items-center gap-3">
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
                            <p className="truncate font-medium text-zinc-100">{contestant.name}</p>
                          </div>
                          <div className="flex items-center">
                            <span className="rounded-full border border-zinc-700 bg-zinc-950/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-300">
                              {contestant.status}
                            </span>
                          </div>
                          <div className="flex items-center">
                            <span
                              className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${typeStyles.badgeClassName}`}
                            >
                              {getContestantTypeLabel(contestant.contestant_type)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
                      Key
                    </p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      {contestantTypeOptions.map((option) => (
                        <div
                          key={option.value}
                          className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${option.badgeClassName}`}
                        >
                          {option.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-zinc-400">No active contestants found.</p>
              )}
            </section>

            <section className="flex flex-wrap gap-3">
              <Link
                href="/predict"
                className="rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
              >
                Make predictions
              </Link>
              <Link
                href="/leaderboard"
                className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-pink-400 hover:text-pink-300"
              >
                View leaderboard
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
          </>
        ) : null}
      </div>
    </main>
  );
}
