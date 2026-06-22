"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { Accordion } from "@/components/Accordion";
import {
  contestantTypeOptions,
  getContestantTypeLabel,
  getContestantTypeStyles,
} from "@/lib/contestantTypes";
import {
  clearStoredLeagueUser,
  getStoredLeagueUser,
  storeLeagueUser,
  type LeagueUser,
} from "@/lib/leagueUser";
import { isRecouplingPrediction } from "@/lib/predictionTypes";
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
  status: string;
  prediction_type: string;
  prediction_deadline?: string | null;
};

type ActualCouple = {
  round_id: string;
  contestant_1_id: string;
  contestant_2_id: string;
};

type RoundResult = {
  round_id: string;
  result_type: string;
  contestant_id: string | null;
};

type RoundBombshellRow = {
  round_id: string;
  bombshell_contestant_id: string;
};

type RoundTrackerEntry = {
  round_id: string;
  contestant_id: string;
  tracker_state: string;
  partner_contestant_id: string | null;
};

type VillaHistoryBoard = Record<string, Record<string, string>>;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getTrackerCellStyles(value: string) {
  if (value === "Dumped") {
    return "bg-red-500/20 text-red-100 italic";
  }

  if (value === "Single and vulnerable") {
    return "bg-fuchsia-300/15 text-fuchsia-100 italic";
  }

  if (value === "Not in villa") {
    return "bg-zinc-800/80 text-zinc-300 italic";
  }

  if (value === "Unknown") {
    return "bg-zinc-900 text-zinc-400";
  }

  return "bg-transparent text-zinc-100";
}

function mapTrackerStateToCellValue(
  trackerState: string,
  partnerContestantId: string | null,
  idToName: Map<string, string>
) {
  if (trackerState === "coupled") {
    return partnerContestantId ? idToName.get(partnerContestantId) ?? "Unknown" : "Unknown";
  }

  if (trackerState === "single") {
    return "Single and vulnerable";
  }

  if (trackerState === "not_in_villa") {
    return "Not in villa";
  }

  if (trackerState === "dumped") {
    return "Dumped";
  }

  return "Unknown";
}

function shortenRoundTitle(title: string) {
  const match = title.match(/^Episode (\d+)(?::\s*(.*))?$/i);

  if (!match) {
    return title;
  }

  return `Ep ${match[1]}`;
}

function getEpisodeNumber(title: string) {
  const match = title.match(/^Episode\s+(\d+)/i);
  return match ? Number.parseInt(match[1], 10) : -1;
}

function sortRoundsChronologically(left: Round, right: Round) {
  const leftEpisodeNumber = getEpisodeNumber(left.title);
  const rightEpisodeNumber = getEpisodeNumber(right.title);

  if (leftEpisodeNumber !== rightEpisodeNumber) {
    return leftEpisodeNumber - rightEpisodeNumber;
  }

  return left.title.localeCompare(right.title);
}

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<LeagueUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [partnerMap, setPartnerMap] = useState<Record<string, string>>({});
  const [villaHistoryBoard, setVillaHistoryBoard] = useState<VillaHistoryBoard>({});
  const [dumpedContestantIds, setDumpedContestantIds] = useState<string[]>([]);
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const visibleBoardContestants = contestants.filter(
    (contestant) =>
      contestant.status !== "eliminated" && !dumpedContestantIds.includes(contestant.id)
  );
  const latestRound = rounds[rounds.length - 1] ?? null;
  const currentRound = latestRound;
  const mobileTrackerRounds = rounds.slice(-6);
  const latestHistoryByContestantId = latestRound ? villaHistoryBoard[latestRound.id] ?? {} : {};
  const mobileBoardContestants = contestants
    .map((contestant) => {
      const isDumped =
        contestant.status === "eliminated" || dumpedContestantIds.includes(contestant.id);
      const currentValue =
        latestHistoryByContestantId[contestant.id] ??
        partnerMap[contestant.id] ??
        (isDumped
          ? "Dumped"
          : contestant.contestant_type === "original_islander"
            ? "Single and vulnerable"
            : "Not in villa");
      const currentPartner =
        currentValue !== "Single and vulnerable" &&
        currentValue !== "Dumped" &&
        currentValue !== "Not in villa" &&
        currentValue !== "Unknown"
          ? currentValue
          : null;
      const currentStatus = isDumped
        ? "Dumped"
        : currentPartner
          ? "Coupled"
          : currentValue === "Not in villa"
            ? "Not in villa"
            : "Single";

      return {
        ...contestant,
        currentPartner,
        currentStatus,
        currentValue,
        isDumped,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name));
  const mobileCurrentCouples = (() => {
    const seenPairs = new Set<string>();
    const contestantsByName = new Map(
      mobileBoardContestants.map((contestant) => [contestant.name, contestant])
    );

    return mobileBoardContestants.flatMap((contestant) => {
      if (contestant.isDumped || contestant.currentStatus === "Not in villa" || !contestant.currentPartner) {
        return [];
      }

      const partnerContestant = contestantsByName.get(contestant.currentPartner);
      const pairKey = [contestant.id, partnerContestant?.id ?? contestant.currentPartner]
        .sort()
        .join(":");

      if (seenPairs.has(pairKey)) {
        return [];
      }

      seenPairs.add(pairKey);

      return [
        {
          id: pairKey,
          label: partnerContestant
            ? `${contestant.name} ❤️ ${partnerContestant.name}`
            : `${contestant.name} ❤️ ${contestant.currentPartner}`,
          islanders: partnerContestant ? [contestant, partnerContestant] : [contestant],
        },
      ];
    });
  })();
  const mobileSingles = mobileBoardContestants.filter(
    (contestant) =>
      !contestant.isDumped &&
      contestant.currentStatus !== "Not in villa" &&
      !contestant.currentPartner
  );
  const mobileDumpedIslanders = mobileBoardContestants.filter((contestant) => contestant.isDumped);

  useEffect(() => {
    const hydratePage = async () => {
      const storedUser = getStoredLeagueUser();
      setUser(storedUser);
      setEmail(storedUser?.email ?? "");

      const [
        { data: contestantsData },
        { data: roundsData },
        { data: actualCouplesData },
        { data: roundResultsData },
        { data: roundBombshellsData },
        { data: trackerEntriesData },
      ] = await Promise.all([
        supabase
          .from("contestants")
          .select("id, name, status, contestant_type, image_url")
          .order("name"),
        supabase
          .from("rounds")
          .select("id, title, status, prediction_type, prediction_deadline")
          .order("created_at", { ascending: true }),
        supabase
          .from("actual_couples")
          .select("round_id, contestant_1_id, contestant_2_id"),
        supabase
          .from("round_results")
          .select("round_id, result_type, contestant_id"),
        supabase
          .from("round_bombshells")
          .select("round_id, bombshell_contestant_id"),
        supabase
          .from("round_tracker_entries")
          .select("round_id, contestant_id, tracker_state, partner_contestant_id"),
      ]);

      const nextContestants = (contestantsData ?? []) as Contestant[];
      setContestants(nextContestants);
      const nextRounds = [...((roundsData ?? []) as Round[])].sort(sortRoundsChronologically);
      setRounds(nextRounds);

      const idToName = new Map(nextContestants.map((contestant) => [contestant.id, contestant.name]));
      const couplesByRoundId = ((actualCouplesData ?? []) as ActualCouple[]).reduce<
        Record<string, ActualCouple[]>
      >((map, couple) => {
        map[couple.round_id] = [...(map[couple.round_id] ?? []), couple];
        return map;
      }, {});
      const dumpedByRoundId = ((roundResultsData ?? []) as RoundResult[]).reduce<
        Record<string, string[]>
      >((map, result) => {
        if (result.result_type === "dumped_pick" && result.contestant_id) {
          map[result.round_id] = [...(map[result.round_id] ?? []), result.contestant_id];
        }
        return map;
      }, {});
      setDumpedContestantIds(
        Array.from(
          new Set(
            Object.values(dumpedByRoundId).flatMap((contestantIds) => contestantIds)
          )
        )
      );
      const bombshellsByRoundId = ((roundBombshellsData ?? []) as RoundBombshellRow[]).reduce<
        Record<string, string[]>
      >((map, row) => {
        map[row.round_id] = [...(map[row.round_id] ?? []), row.bombshell_contestant_id];
        return map;
      }, {});
      const trackerEntriesByRoundId = ((trackerEntriesData ?? []) as RoundTrackerEntry[]).reduce<
        Record<string, RoundTrackerEntry[]>
      >((map, entry) => {
        map[entry.round_id] = [...(map[entry.round_id] ?? []), entry];
        return map;
      }, {});

      const currentStateByContestant = nextContestants.reduce<Record<string, string>>(
        (map, contestant) => {
          map[contestant.id] =
            contestant.contestant_type === "original_islander"
              ? "Single and vulnerable"
              : "Not in villa";
          return map;
        },
        {}
      );
      const dumpedContestantIds = new Set<string>();
      const historySnapshots: VillaHistoryBoard = {};

      nextRounds.forEach((round) => {
        const roundBombshellIds = bombshellsByRoundId[round.id] ?? [];
        roundBombshellIds.forEach((contestantId) => {
            if (!dumpedContestantIds.has(contestantId) && currentStateByContestant[contestantId] === "Not in villa") {
            currentStateByContestant[contestantId] = "Single and vulnerable";
          }
        });

        if (isRecouplingPrediction(round.prediction_type)) {
          Object.keys(currentStateByContestant).forEach((contestantId) => {
            if (!dumpedContestantIds.has(contestantId) && currentStateByContestant[contestantId] !== "Not in villa") {
              currentStateByContestant[contestantId] = "Single and vulnerable";
            }
          });

          (couplesByRoundId[round.id] ?? []).forEach((couple) => {
            currentStateByContestant[couple.contestant_1_id] =
              idToName.get(couple.contestant_2_id) ?? "Unknown";
            currentStateByContestant[couple.contestant_2_id] =
              idToName.get(couple.contestant_1_id) ?? "Unknown";
          });
        }

        (dumpedByRoundId[round.id] ?? []).forEach((contestantId) => {
          dumpedContestantIds.add(contestantId);
          currentStateByContestant[contestantId] = "Dumped";
        });

        (trackerEntriesByRoundId[round.id] ?? []).forEach((entry) => {
          currentStateByContestant[entry.contestant_id] = mapTrackerStateToCellValue(
            entry.tracker_state,
            entry.partner_contestant_id,
            idToName
          );
        });

        historySnapshots[round.id] = { ...currentStateByContestant };
      });

      setVillaHistoryBoard(historySnapshots);

      const finalPartnerMap: Record<string, string> = {};
      Object.entries(currentStateByContestant).forEach(([contestantId, value]) => {
        if (
          value !== "Single and vulnerable" &&
          value !== "Dumped" &&
          value !== "Not in villa"
        ) {
          finalPartnerMap[contestantId] = value;
        }
      });
      setPartnerMap(finalPartnerMap);

      setLoadingUser(false);
    };

    void hydratePage();
  }, []);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const trimmedName = name.trim();
    const normalizedEmail = normalizeEmail(email);

    if (!trimmedName && !normalizedEmail) {
      setErrorMessage("Enter your name or your email to continue.");
      setSubmitting(false);
      return;
    }

    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      setErrorMessage("Enter a valid email address.");
      setSubmitting(false);
      return;
    }

    let nextUser: LeagueUser | null = null;

    if (normalizedEmail) {
      const { data: existingByEmail, error: existingByEmailError } = await supabase
        .from("league_users")
        .select("id, name, email")
        .eq("email", normalizedEmail)
        .maybeSingle();

      if (existingByEmailError) {
        setErrorMessage(existingByEmailError.message);
        setSubmitting(false);
        return;
      }

      if (existingByEmail) {
        const resolvedName = trimmedName || existingByEmail.name;
        const { data: updatedUser, error: updateError } = await supabase
          .from("league_users")
          .update({ name: resolvedName, email: normalizedEmail })
          .eq("id", existingByEmail.id)
          .select("id, name, email")
          .single();

        if (updateError) {
          setErrorMessage(updateError.message);
          setSubmitting(false);
          return;
        }

        nextUser = updatedUser as LeagueUser;
      } else {
        if (!trimmedName) {
          setErrorMessage("Add your name the first time you join the league.");
          setSubmitting(false);
          return;
        }

        const { data: existingByName, error: existingByNameError } = await supabase
          .from("league_users")
          .select("id, name, email")
          .eq("name", trimmedName)
          .maybeSingle();

        if (existingByNameError) {
          setErrorMessage(existingByNameError.message);
          setSubmitting(false);
          return;
        }

        if (existingByName) {
          const { data: updatedUser, error: updateError } = await supabase
            .from("league_users")
            .update({ email: normalizedEmail })
            .eq("id", existingByName.id)
            .select("id, name, email")
            .single();

          if (updateError) {
            setErrorMessage(updateError.message);
            setSubmitting(false);
            return;
          }

          nextUser = updatedUser as LeagueUser;
        } else {
          const { data: insertedUser, error: insertError } = await supabase
            .from("league_users")
            .insert({ name: trimmedName, email: normalizedEmail })
            .select("id, name, email")
            .single();

          if (insertError) {
            setErrorMessage(insertError.message);
            setSubmitting(false);
            return;
          }

          nextUser = insertedUser as LeagueUser;
        }
      }
    } else {
      const { data, error } = await supabase
        .from("league_users")
        .upsert({ name: trimmedName }, { onConflict: "name" })
        .select("id, name, email")
        .single();

      if (error) {
        setErrorMessage(error.message);
        setSubmitting(false);
        return;
      }

      nextUser = data as LeagueUser;
    }

    if (!nextUser) {
      setErrorMessage("Unable to log in right now.");
      setSubmitting(false);
      return;
    }

    storeLeagueUser(nextUser);
    setUser(nextUser);
    setName(nextUser.name);
    setEmail(nextUser.email ?? normalizedEmail);
    setSuccessMessage(
      nextUser.email
        ? `Logged in as ${nextUser.name}. Round alerts will go to ${nextUser.email}.`
        : `Logged in as ${nextUser.name}.`
    );
    setSubmitting(false);
  };

  const handleSaveEmail = async () => {
    if (!user) {
      return;
    }

    setSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    const normalizedEmail = normalizeEmail(email);

    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      setErrorMessage("Enter a valid email address.");
      setSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from("league_users")
      .update({ email: normalizedEmail || null })
      .eq("id", user.id)
      .select("id, name, email")
      .single();

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    const updatedUser = data as LeagueUser;
    storeLeagueUser(updatedUser);
    setUser(updatedUser);
    setEmail(updatedUser.email ?? "");
    setSuccessMessage(
      updatedUser.email
        ? `Round alerts will go to ${updatedUser.email}.`
        : "Alert email removed."
    );
    setSubmitting(false);
  };

  const handleSignOut = () => {
    clearStoredLeagueUser();
    setUser(null);
    setName("");
    setEmail("");
    setErrorMessage("");
    setSuccessMessage("Signed out.");
  };

  const toggleHistory = (contestantId: string) => {
    setExpandedHistoryIds((currentValue) =>
      currentValue.includes(contestantId)
        ? currentValue.filter((currentId) => currentId !== contestantId)
        : [...currentValue, contestantId]
    );
  };

  return (
    <main className="min-h-screen bg-black px-4 py-5 text-zinc-100 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 sm:gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <div className="relative">
            <Image
              src="/love-island-banner.jpg"
              alt="Love Island beach banner"
              width={1200}
              height={675}
              className="h-32 w-full object-cover sm:h-44"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          </div>
          <div className="p-5 sm:p-8">
            <h1 className="text-center text-4xl font-semibold tracking-tight sm:text-left sm:text-5xl">
              Love Island
              <br />
              Fantasy League
            </h1>
          </div>
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

        <section className="rounded-[2rem] border border-sky-400/20 bg-zinc-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-sky-300">
                Current Round
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                {currentRound?.title ?? "No live round right now"}
              </h2>
              <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.18em]">
                <span
                  className={`rounded-full border px-3 py-2 ${
                    currentRound?.status === "open"
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                      : "border-zinc-700 bg-zinc-900 text-zinc-300"
                  }`}
                >
                  {currentRound?.status === "open" ? "Open for picks" : currentRound?.status ?? "Waiting"}
                </span>
              </div>
            </div>
            <div className="grid w-full gap-3 sm:w-auto sm:min-w-64">
              <Link
                href={
                  currentRound?.status === "open"
                    ? user
                      ? "/predict"
                      : "/profile"
                    : "/leaderboard"
                }
                className="flex min-h-12 items-center justify-center rounded-2xl bg-sky-400 px-4 text-base font-semibold text-black transition hover:bg-sky-300"
              >
                {currentRound?.status === "open" ? "Make picks" : "View results"}
              </Link>
            </div>
          </div>
        </section>

        <section className="hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)] md:block">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-pink-300">
              Love Island Basics
            </p>
            <h2 className="mt-2 text-3xl font-semibold">What actually happens in the villa</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              Islanders live together, couple up, get split apart, and survive a steady stream of
              bombshells, recouplings, and eliminations. New arrivals can steal people, couples can
              break overnight, and anyone left single or unpopular can end up dumped from the villa.
              That shifting relationship chaos is what this league is built around.
            </p>
          </div>

          <div className="mt-6 grid gap-3 text-sm text-zinc-300 sm:grid-cols-3">
            <div className="rounded-2xl border border-pink-400/20 bg-pink-500/10 p-4">
              <p className="font-semibold text-pink-200">Couplings change fast</p>
              <p className="mt-2 text-zinc-300/80">
                Islanders pair up early, but bombshells and recouplings can flip everything in a
                single episode.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
              <p className="font-semibold text-sky-100">Bombshells cause chaos</p>
              <p className="mt-2 text-zinc-300/80">
                New contestants arrive to tempt, steal, and shake up couples that looked safe five
                minutes earlier.
              </p>
            </div>
            <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4">
              <p className="font-semibold text-yellow-100">Dumpings raise the stakes</p>
              <p className="mt-2 text-zinc-300/80">
                Islanders who lose their partner, lose public support, or get caught in the wrong
                twist can be sent home.
              </p>
            </div>
          </div>

          <div className="mt-8 border-t border-zinc-800 pt-8">
          <div className="max-w-3xl">
            <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-300">
              How to play
            </p>
            <h2 className="mt-2 text-3xl font-semibold">Make your picks before the villa flips</h2>
            <p className="mt-3 text-sm leading-7 text-zinc-400">
              Every episode gets its own round, even if it turns out to be a no-score watch-only
              night. Log in, make the right kind of pick for the current round, then come back
              after each episode to see how the leaderboard moves.
            </p>
          </div>
          <div className="mt-6 grid gap-3 text-sm text-zinc-300 sm:grid-cols-3">
            <div className="rounded-2xl border border-pink-400/20 bg-pink-500/10 p-4">
              <p className="font-semibold text-pink-200">1. Log in</p>
              <p className="mt-2 text-zinc-300/80">
                Claim your player name and enter the villa.
              </p>
            </div>
            <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
              <p className="font-semibold text-sky-100">2. Predict</p>
              <p className="mt-2 text-zinc-300/80">
                Submit the right kind of pick for that episode’s round before it locks.
              </p>
            </div>
            <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4">
              <p className="font-semibold text-yellow-100">3. Score</p>
              <p className="mt-2 text-zinc-300/80">
                Watch the leaderboard shift after each episode once scores drop.
              </p>
            </div>
          </div>

          <div className="mt-8">
            <div className="max-w-3xl">
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-yellow-200">
                Points by round
              </p>
              <h3 className="mt-2 text-2xl font-semibold">How scoring works</h3>
              <p className="mt-3 text-sm leading-7 text-zinc-400">
                Different episode types use different scoring, so players only make the picks that
                match that round.
              </p>
            </div>

            <div className="mt-6 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-pink-400/20 bg-pink-500/10 p-5">
                <p className="font-semibold text-pink-200">Recoupling prediction</p>
                <p className="mt-2 text-sm text-zinc-300/80">Exact couple match: +5</p>
                <p className="mt-1 text-sm text-zinc-300/80">One correct person, wrong partner: +2</p>
                <p className="mt-1 text-sm text-zinc-300/80">Wrong: 0</p>
              </div>

              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-5">
                <p className="font-semibold text-sky-100">Elimination prediction</p>
                <p className="mt-2 text-sm text-zinc-300/80">Correct dumped islander: +5</p>
                <p className="mt-1 text-sm text-zinc-300/80">
                  Correct bottom-group survivor: +2
                </p>
              </div>

              <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-5">
                <p className="font-semibold text-yellow-100">Bombshell arrival prediction</p>
                <p className="mt-2 text-sm text-zinc-300/80">
                  Correctly guess who each bombshell goes after: +5 each
                </p>
              </div>

              <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5">
                <p className="font-semibold text-zinc-100">No-score episode</p>
                <p className="mt-2 text-sm text-zinc-300/80">
                  Watch-only round. No picks, no points, but the episode still gets its own round in
                  the league.
                </p>
              </div>
            </div>
          </div>
          </div>
        </section>

        <section
          id="villa-board"
          className="rounded-[2rem] border border-yellow-300/20 bg-zinc-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-2xl font-semibold text-zinc-100">
                Villa Status
              </p>
            </div>
            <div className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100">
              {latestRound ? `Latest round: ${latestRound.title}` : "Waiting for first round"}
            </div>
          </div>

          <div className="mx-auto mt-6 max-w-4xl">
            {mobileCurrentCouples.length > 0 ||
            mobileSingles.length > 0 ||
            mobileDumpedIslanders.length > 0 ? (
              <div className="space-y-5">
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-zinc-100">Current Couples</h3>
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                      {mobileCurrentCouples.length}
                    </span>
                  </div>

                  {mobileCurrentCouples.length > 0 ? (
                    <div className="space-y-3">
                      {mobileCurrentCouples.map((couple) => (
                      <article
                        key={`mobile-couple-${couple.id}`}
                        className="rounded-[1.7rem] border border-zinc-800 bg-zinc-900/80 p-3.5"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-zinc-100">{couple.label}</p>
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-100">
                            Coupled
                          </span>
                        </div>

                        <div className="mt-3 space-y-2.5">
                          {couple.islanders.map((contestant) => {
                            const typeStyles = getContestantTypeStyles(contestant.contestant_type);

                            return (
                              <div
                                key={`${couple.id}-${contestant.id}`}
                                className={`rounded-[1.35rem] border border-zinc-800 p-3 ${typeStyles.rowClassName}`}
                              >
                                <div className="flex items-start gap-3">
                                  <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
                                    {contestant.image_url ? (
                                      <Image
                                        src={contestant.image_url}
                                        alt={contestant.name}
                                        fill
                                        className="object-cover"
                                        unoptimized
                                      />
                                    ) : null}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="truncate text-[15px] font-semibold text-zinc-100">
                                        {contestant.name}
                                      </p>
                                      <span
                                        className={`rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${typeStyles.badgeClassName}`}
                                      >
                                        {getContestantTypeLabel(contestant.contestant_type)}
                                      </span>
                                    </div>
                                    <div className="mt-2 space-y-1 text-sm text-zinc-300">
                                      <p>
                                        Status:{" "}
                                        <span className="font-semibold text-zinc-100">Coupled</span>
                                      </p>
                                      <p>
                                        Partner:{" "}
                                        <span className="font-semibold text-zinc-100">
                                          {contestant.currentPartner ?? "None"}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                </div>

                                <button
                                  type="button"
                                  onClick={() => toggleHistory(contestant.id)}
                                  className="mt-3 flex min-h-11 w-full items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                                >
                                  {expandedHistoryIds.includes(contestant.id)
                                    ? "Hide History"
                                    : "View History"}
                                </button>

                                {expandedHistoryIds.includes(contestant.id) ? (
                                  <div className="mt-3 space-y-2">
                                    {mobileTrackerRounds.length > 0 ? (
                                      mobileTrackerRounds.map((round) => {
                                        const cellValue =
                                          villaHistoryBoard[round.id]?.[contestant.id] ??
                                          (contestant.contestant_type === "original_islander"
                                            ? "Single and vulnerable"
                                            : "Not in villa");

                                        return (
                                        <div
                                          key={`${contestant.id}-${round.id}-history`}
                                          className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                                {shortenRoundTitle(round.title)}
                                              </p>
                                              <p className="truncate text-xs text-zinc-500">
                                                {round.title}
                                              </p>
                                            </div>
                                            <p className="mt-1 text-sm text-zinc-200">{cellValue}</p>
                                          </div>
                                        );
                                      })
                                    ) : (
                                      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-400">
                                        No round data yet.
                                      </div>
                                    )}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    ))}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                      No confirmed couples yet.
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-zinc-100">Singles</h3>
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                      {mobileSingles.length}
                    </span>
                  </div>

                  {mobileSingles.length > 0 ? (
                    <div className="space-y-3">
                    {mobileSingles.map((contestant) => {
                      const typeStyles = getContestantTypeStyles(contestant.contestant_type);

                      return (
                        <article
                          key={`mobile-single-${contestant.id}`}
                          className={`rounded-[1.6rem] border border-zinc-800 p-3.5 ${typeStyles.rowClassName}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
                              {contestant.image_url ? (
                                <Image
                                  src={contestant.image_url}
                                  alt={contestant.name}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-base font-semibold text-zinc-100">
                                  {contestant.name}
                                </p>
                                <span className="shrink-0 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-fuchsia-100">
                                  Single
                                </span>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${typeStyles.badgeClassName}`}
                                >
                                  {getContestantTypeLabel(contestant.contestant_type)}
                                </span>
                              </div>

                              <div className="mt-3 space-y-1 text-sm text-zinc-300">
                                <p>
                                  Current status:{" "}
                                  <span className="font-semibold text-zinc-100">Single and vulnerable</span>
                                </p>
                                <p>
                                  Current partner:{" "}
                                  <span className="font-semibold text-zinc-100">None</span>
                                </p>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleHistory(contestant.id)}
                            className="mt-4 flex min-h-11 w-full items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                          >
                            {expandedHistoryIds.includes(contestant.id) ? "Hide History" : "View History"}
                          </button>

                          {expandedHistoryIds.includes(contestant.id) ? (
                            <div className="mt-3 space-y-2">
                              {mobileTrackerRounds.length > 0 ? (
                                mobileTrackerRounds.map((round) => {
                                  const cellValue =
                                    villaHistoryBoard[round.id]?.[contestant.id] ??
                                    (contestant.contestant_type === "original_islander"
                                      ? "Single and vulnerable"
                                      : "Not in villa");

                                  return (
                                    <div
                                      key={`${contestant.id}-${round.id}-history`}
                                      className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                          {shortenRoundTitle(round.title)}
                                        </p>
                                        <p className="truncate text-xs text-zinc-500">
                                          {round.title}
                                        </p>
                                      </div>
                                      <p className="mt-1 text-sm text-zinc-200">{cellValue}</p>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-400">
                                  No round data yet.
                                </div>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                      No singles right now.
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-zinc-100">Dumped Islanders</h3>
                    <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
                      {mobileDumpedIslanders.length}
                    </span>
                  </div>

                  {mobileDumpedIslanders.length > 0 ? (
                    <div className="space-y-3">
                    {mobileDumpedIslanders.map((contestant) => {
                      const typeStyles = getContestantTypeStyles(contestant.contestant_type);

                      return (
                        <article
                          key={`mobile-dumped-${contestant.id}`}
                          className={`rounded-[1.6rem] border border-zinc-800 p-3.5 ${typeStyles.rowClassName}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
                              {contestant.image_url ? (
                                <Image
                                  src={contestant.image_url}
                                  alt={contestant.name}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <p className="truncate text-base font-semibold text-zinc-100">
                                  {contestant.name}
                                </p>
                                <span className="shrink-0 rounded-full border border-red-400/30 bg-red-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-100">
                                  Dumped
                                </span>
                              </div>

                              <div className="mt-2 flex flex-wrap gap-1.5">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${typeStyles.badgeClassName}`}
                                >
                                  {getContestantTypeLabel(contestant.contestant_type)}
                                </span>
                              </div>

                              <div className="mt-3 space-y-1 text-sm text-zinc-300">
                                <p>
                                  Current status:{" "}
                                  <span className="font-semibold text-zinc-100">Dumped</span>
                                </p>
                                <p>
                                  Current partner:{" "}
                                  <span className="font-semibold text-zinc-100">None</span>
                                </p>
                              </div>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => toggleHistory(contestant.id)}
                            className="mt-4 flex min-h-11 w-full items-center justify-center rounded-2xl border border-zinc-800 bg-zinc-950/80 px-4 text-sm font-semibold text-zinc-200 transition hover:border-zinc-600 hover:bg-zinc-900"
                          >
                            {expandedHistoryIds.includes(contestant.id) ? "Hide History" : "View History"}
                          </button>

                          {expandedHistoryIds.includes(contestant.id) ? (
                            <div className="mt-3 space-y-2">
                              {mobileTrackerRounds.length > 0 ? (
                                mobileTrackerRounds.map((round) => {
                                  const cellValue =
                                    villaHistoryBoard[round.id]?.[contestant.id] ??
                                    (contestant.contestant_type === "original_islander"
                                      ? "Single and vulnerable"
                                      : "Not in villa");

                                  return (
                                    <div
                                      key={`${contestant.id}-${round.id}-history`}
                                      className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-2.5"
                                    >
                                      <div className="flex items-center justify-between gap-3">
                                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                                          {shortenRoundTitle(round.title)}
                                        </p>
                                        <p className="truncate text-xs text-zinc-500">
                                          {round.title}
                                        </p>
                                      </div>
                                      <p className="mt-1 text-sm text-zinc-200">{cellValue}</p>
                                    </div>
                                  );
                                })
                              ) : (
                                <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-3 text-sm text-zinc-400">
                                  No round data yet.
                                </div>
                              )}
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                      No one has been dumped yet.
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-400">
                Add contestants in admin to start filling the villa board.
              </div>
            )}
          </div>

          <div className="mx-auto mt-5 grid max-w-4xl gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
                Islander key
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
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zinc-400">
                Board key
              </p>
              <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold uppercase tracking-[0.18em]">
                <div className="rounded-full border border-zinc-700 bg-zinc-950 px-3 py-2 text-zinc-200">
                  Partner name
                </div>
                <div className="rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-2 text-fuchsia-100">
                  Single and vulnerable
                </div>
                <div className="rounded-full border border-red-400/30 bg-red-500/10 px-3 py-2 text-red-100">
                  Dumped
                </div>
                <div className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-300">
                  Not in villa
                </div>
              </div>
            </div>
          </div>

        </section>

        <section className="space-y-3 md:hidden">
          <Accordion title="Love Island Basics" label="Quick Context">
            <div className="space-y-3">
              <div className="rounded-2xl border border-pink-400/20 bg-pink-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pink-200">Couple up</p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Islanders pair up fast, but recouplings can flip everything in a single night.
                </p>
              </div>
              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-100">Bombshells</p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  New arrivals tempt, steal, and change the whole villa math.
                </p>
              </div>
              <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100">Dumpings</p>
                <p className="mt-2 text-sm leading-6 text-zinc-300">
                  Singles or shaky couples can get dumped once the stakes rise.
                </p>
              </div>
            </div>
          </Accordion>

          <Accordion title="How to play" label="Three Steps">
            <div className="space-y-3">
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-semibold text-zinc-100">1. Log in</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Claim your player name and save your alert email if you want updates.
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-semibold text-zinc-100">2. Predict the current round</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Every episode gets a round, and the prediction type changes with the villa drama.
                </p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-semibold text-zinc-100">3. Watch the leaderboard move</p>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Scores update after each episode once the real outcomes are entered and scored.
                </p>
              </div>
            </div>
          </Accordion>

          <Accordion title="Points by round" label="Scoring">
            <div className="space-y-3">
              <div className="rounded-2xl border border-pink-400/20 bg-pink-500/10 p-4">
                <p className="text-sm font-semibold text-pink-200">Recoupling</p>
                <p className="mt-2 text-sm text-zinc-300/80">Exact match +5, partial match +2.</p>
              </div>
              <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4">
                <p className="text-sm font-semibold text-sky-100">Elimination</p>
                <p className="mt-2 text-sm text-zinc-300/80">Dumped islander +5, second question +2.</p>
              </div>
              <div className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4">
                <p className="text-sm font-semibold text-yellow-100">Bombshell</p>
                <p className="mt-2 text-sm text-zinc-300/80">Correct target is +5 for each bombshell.</p>
              </div>
              <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
                <p className="text-sm font-semibold text-zinc-100">No-score</p>
                <p className="mt-2 text-sm text-zinc-300/80">Watch-only episode, no points awarded.</p>
              </div>
            </div>
          </Accordion>
        </section>

      </div>
    </main>
  );
}
