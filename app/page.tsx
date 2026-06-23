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
  const mobileDumpedIslanders = mobileBoardContestants.filter((contestant) => contestant.isDumped);
  const villaHouseNameMatchers = [
    "mackenzie",
    "kenzie",
    "melanie",
    "aniya",
    "jen",
    "trinity",
    "kayda",
    "carl",
    "chandlar",
    "chay",
    "corey",
    "dylan",
    "gal",
    "keyon",
    "kyle",
    "ronnie",
    "ryan",
    "tino",
    "trae",
  ];
  const casaAmorHouseNameMatchers = [
    "alannah",
    "amora",
    "jaiden",
    "parmida",
    "tierra",
    "sydney",
    "caleb",
    "sincere",
    "zach",
    "bryce",
    "kc",
    "corbin",
  ];
  const isVillaHouseContestant = (contestant: (typeof mobileBoardContestants)[number]) => {
    const normalizedName = contestant.name.trim().toLowerCase();

    return villaHouseNameMatchers.some((matcher) => normalizedName.includes(matcher));
  };
  const isCasaHouseContestant = (contestant: (typeof mobileBoardContestants)[number]) => {
    const normalizedName = contestant.name.trim().toLowerCase();

    return casaAmorHouseNameMatchers.some((matcher) => normalizedName.includes(matcher));
  };
  const villaHouseContestants = mobileBoardContestants.filter(
    (contestant) => !contestant.isDumped && isVillaHouseContestant(contestant)
  );
  const casaAmorHouseContestants = mobileBoardContestants.filter(
    (contestant) =>
      !contestant.isDumped &&
      (isCasaHouseContestant(contestant) || !isVillaHouseContestant(contestant))
  );

  const renderBoardContestantCard = (contestant: (typeof mobileBoardContestants)[number]) => {
    const typeStyles = getContestantTypeStyles(contestant.contestant_type);

    return (
      <article
        key={`board-${contestant.id}`}
        className={`rounded-[1.1rem] border border-zinc-800 p-2 ${typeStyles.rowClassName}`}
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
              <p className="truncate text-[13px] font-semibold leading-5 text-zinc-100">
                {contestant.name}
              </p>
              <span
                className={`rounded-full border px-1.5 py-1 text-[8px] font-semibold uppercase tracking-[0.12em] ${typeStyles.badgeClassName}`}
              >
                {getContestantTypeLabel(contestant.contestant_type)}
              </span>
            </div>

            <div className="mt-1.5 space-y-1 text-[11px] text-zinc-300">
              <p>
                Current status:{" "}
                <span className="font-semibold text-zinc-100">
                  {contestant.currentStatus === "Single"
                    ? "Single and vulnerable"
                    : contestant.currentStatus}
                </span>
              </p>
              <p>
                Current partner:{" "}
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
          className="mt-2 flex min-h-7 w-full items-center justify-center rounded-full border border-zinc-800 bg-zinc-950/80 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-300 transition hover:border-zinc-600 hover:bg-zinc-900"
        >
          {expandedHistoryIds.includes(contestant.id) ? "Hide history" : "History"}
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
                    className="rounded-2xl border border-zinc-800 bg-zinc-950/70 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                        {shortenRoundTitle(round.title)}
                      </p>
                      <p className="truncate text-xs text-zinc-500">{round.title}</p>
                    </div>
                    <p className="mt-1 text-xs text-zinc-200">{cellValue}</p>
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
  };

  const renderHouseSection = (
    label: string,
    contestantsInHouse: (typeof mobileBoardContestants)[number][],
    emptyState: string
  ) => (
    <div className="relative pt-5">
      <div className="pointer-events-none absolute left-1/2 top-0 h-8 w-8 -translate-x-1/2 rotate-45 rounded-[0.35rem] border-l border-t border-zinc-700 bg-zinc-950" />
      <div className="rounded-[1.8rem] border border-zinc-700 bg-zinc-900/40 p-3 shadow-[0_18px_40px_rgba(0,0,0,0.28)] sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-zinc-100">{label}</h3>
          <span className="rounded-full border border-zinc-700 bg-zinc-950 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-300">
            {contestantsInHouse.length}
          </span>
        </div>

        {contestantsInHouse.length > 0 ? (
          <div className="mt-3 space-y-2">
            {contestantsInHouse.map((contestant) => renderBoardContestantCard(contestant))}
          </div>
        ) : (
          <div className="mt-3 rounded-3xl border border-zinc-800 bg-zinc-950/70 p-4 text-sm text-zinc-400">
            {emptyState}
          </div>
        )}
      </div>
    </div>
  );

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

          <div className="mx-auto mt-6 max-w-5xl">
            {villaHouseContestants.length > 0 ||
            casaAmorHouseContestants.length > 0 ||
            mobileDumpedIslanders.length > 0 ? (
              <div className="space-y-5">
                <div className="grid gap-5 lg:grid-cols-2">
                  {renderHouseSection(
                    "Villa",
                    villaHouseContestants,
                    "No islanders are currently assigned to the Villa house."
                  )}

                  {renderHouseSection(
                    "Casa Amor",
                    casaAmorHouseContestants,
                    "No islanders are currently assigned to the Casa Amor house."
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
                      {mobileDumpedIslanders.map((contestant) => renderBoardContestantCard(contestant))}
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

        <section className="space-y-3">
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
