"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
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
};

type ActualCouple = {
  contestant_1_id: string;
  contestant_2_id: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function Home() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<LeagueUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingUser, setLoadingUser] = useState(true);
  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [latestRound, setLatestRound] = useState<Round | null>(null);
  const [partnerMap, setPartnerMap] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const hydratePage = async () => {
      const storedUser = getStoredLeagueUser();
      setUser(storedUser);
      setEmail(storedUser?.email ?? "");

      const [
        { data: contestantsData },
        { data: latestRoundData },
      ] = await Promise.all([
        supabase
          .from("contestants")
          .select("id, name, status, contestant_type, image_url")
          .order("name"),
        supabase
          .from("rounds")
          .select("id, title, status")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      const nextContestants = (contestantsData ?? []) as Contestant[];
      setContestants(nextContestants);
      const round = (latestRoundData ?? null) as Round | null;
      setLatestRound(round);

      if (round) {
        const { data: actualCouplesData } = await supabase
          .from("actual_couples")
          .select("contestant_1_id, contestant_2_id")
          .eq("round_id", round.id);

        const idToName = new Map(nextContestants.map((contestant) => [contestant.id, contestant.name]));
        const nextPartnerMap: Record<string, string> = {};

        ((actualCouplesData ?? []) as ActualCouple[]).forEach((couple) => {
          nextPartnerMap[couple.contestant_1_id] =
            idToName.get(couple.contestant_2_id) ?? "TBD";
          nextPartnerMap[couple.contestant_2_id] =
            idToName.get(couple.contestant_1_id) ?? "TBD";
        });

        setPartnerMap(nextPartnerMap);
      }

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

  return (
    <main className="min-h-screen bg-black px-6 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <section className="overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <div className="relative">
            <Image
              src="/love-island-banner.jpg"
              alt="Love Island beach banner"
              width={1200}
              height={675}
              className="h-56 w-full object-cover sm:h-72"
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
            <div className="absolute left-0 top-0 h-28 w-28 rounded-full bg-pink-500/25 blur-3xl" />
            <div className="absolute right-10 top-12 h-24 w-24 rounded-full bg-sky-400/20 blur-3xl" />
            <div className="absolute bottom-10 right-24 h-20 w-20 rounded-full bg-yellow-300/20 blur-3xl" />
          </div>
          <div className="border-t border-zinc-800 bg-zinc-950 p-8 sm:p-10">
            <div className="flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-[0.3em]">
              <span className="rounded-full border border-pink-400/40 bg-pink-500/10 px-3 py-1 text-pink-300">
                Fantasy Prediction League
              </span>
            </div>
            <h1 className="mt-5 text-5xl font-semibold tracking-tight sm:text-6xl">
              Love Island Fantasy League
            </h1>
            <p className="mt-4 max-w-3xl text-lg leading-8 text-zinc-200/80">
              Pick your dream couples, call the villa drama early, and keep tabs on
              who is thriving, spiraling, or one text away from chaos.
            </p>
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

        <section className="rounded-[2rem] border border-zinc-800 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
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
                  Correctly guess who the bombshell goes after: +5
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

        <section className="grid gap-6 md:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[2rem] border border-pink-500/25 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            {user ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-2xl font-semibold">Player profile</h2>
                    <p className="mt-2 text-sm leading-6 text-zinc-400">
                      Keep your league name and alert email tidy here.
                    </p>
                  </div>
                  <div className="rounded-full border border-pink-400/30 bg-pink-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-pink-200">
                    Signed in
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      Display name
                    </p>
                    <p className="mt-3 text-xl font-semibold text-zinc-100">{user.name}</p>
                  </div>
                  <div className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      Alert status
                    </p>
                    <p className="mt-3 text-sm text-zinc-300">
                      {user.email ? "Email alerts are live" : "No alert email saved yet"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
                  <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                    Alert email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
                    />
                  </label>
                  <p className="mt-3 text-xs leading-6 text-zinc-500">
                    {user.email
                      ? `Current alerts go to ${user.email}.`
                      : "Add an email here if you want new round alerts and easier profile recovery later."}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleSaveEmail}
                      disabled={submitting}
                      className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {submitting ? "Saving..." : "Save alert email"}
                    </button>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-semibold">Log in</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-400">
                  Claim your name, and optionally add an email so new round alerts can land in your inbox.
                </p>

                <form onSubmit={handleLogin} className="mt-6 flex flex-col gap-4">
                  <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                    Display name
                    <input
                      type="text"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="Name"
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-yellow-300"
                    />
                  </label>
                  <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                    Email for round alerts
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      className="rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
                    />
                    <span className="text-xs text-zinc-500">
                      Optional, but if you use the same email later we can log you back into the same profile.
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-yellow-300 px-5 py-3 text-sm font-semibold text-black transition hover:from-pink-400 hover:via-sky-400 hover:to-yellow-200 disabled:cursor-not-allowed disabled:from-pink-300 disabled:to-yellow-200"
                  >
                    {submitting ? "Logging in..." : "Continue"}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="rounded-[2rem] border border-sky-400/25 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
            <h2 className="text-2xl font-semibold">League access</h2>
            {loadingUser ? (
              <p className="mt-3 text-sm text-zinc-400">Checking your local login...</p>
            ) : user ? (
              <>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  Signed in as <span className="font-semibold text-zinc-100">{user.name}</span>. Jump straight into the villa.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      Status
                    </p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">Ready to play</p>
                  </div>
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                      Alerts
                    </p>
                    <p className="mt-2 text-sm font-medium text-zinc-100">
                      {user.email ? "Email on file" : "Not set"}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <Link
                    href="/dashboard"
                    className="rounded-3xl bg-pink-500 px-5 py-4 text-center text-sm font-semibold text-black transition hover:bg-pink-400"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href="/predict"
                    className="rounded-3xl border border-sky-400/30 bg-sky-500/10 px-5 py-4 text-center text-sm font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20"
                  >
                    Prediction Rounds
                  </Link>
                  <Link
                    href="/leaderboard"
                    className="rounded-3xl border border-yellow-300/30 bg-yellow-300/10 px-5 py-4 text-center text-sm font-semibold text-yellow-100 transition hover:border-yellow-200 hover:bg-yellow-300/20"
                  >
                    Leaderboard
                  </Link>
                  <Link
                    href="/chat"
                    className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-center text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/20"
                  >
                    Villa Chat
                  </Link>
                </div>
                <div className="mt-3">
                  <Link
                    href="/admin"
                    className="block w-full rounded-3xl border border-zinc-700 bg-zinc-900 px-5 py-4 text-center text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
                  >
                    Admin
                  </Link>
                </div>
              </>
            ) : (
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Once you enter your name or email, quick links to the dashboard, prediction form,
                leaderboard, and admin page will appear here.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-yellow-300/20 bg-zinc-950 p-8 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.3em] text-yellow-200">
                Villa Update Board
              </p>
              <h2 className="mt-2 text-3xl font-semibold">Coupling and elimination tracker</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-zinc-400">
                A quick-look graphic for who is currently active, who has a confirmed
                partner, and who is still floating around the villa.
              </p>
            </div>
            <div className="rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100">
              {latestRound ? `Latest round: ${latestRound.title}` : "Waiting for first round"}
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-[1.5rem] border border-zinc-800">
            <table className="min-w-full border-collapse text-left">
              <thead>
                <tr className="bg-zinc-900 text-sm text-zinc-300">
                  <th className="border-b border-zinc-800 px-4 py-3 font-semibold">Islander</th>
                  <th className="border-b border-zinc-800 px-4 py-3 font-semibold">Status</th>
                  <th className="border-b border-zinc-800 px-4 py-3 font-semibold">Type</th>
                  <th className="border-b border-zinc-800 px-4 py-3 font-semibold">Current partner</th>
                  <th className="border-b border-zinc-800 px-4 py-3 font-semibold">Villa note</th>
                </tr>
              </thead>
              <tbody>
                {contestants.length > 0 ? (
                  contestants.map((contestant) => {
                    const partner = partnerMap[contestant.id];
                    const isActive = contestant.status === "active";
                    const typeStyles = getContestantTypeStyles(contestant.contestant_type);

                    return (
                      <tr key={contestant.id} className={typeStyles.rowClassName}>
                        <td className="border-b border-zinc-900 px-4 py-4 font-semibold text-zinc-100">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
                              {contestant.image_url ? (
                                <Image
                                  src={contestant.image_url}
                                  alt={contestant.name}
                                  fill
                                  className="object-cover"
                                />
                              ) : null}
                            </div>
                            <span>{contestant.name}</span>
                          </div>
                        </td>
                        <td className="border-b border-zinc-900 px-4 py-4">
                          <span
                            className={
                              isActive
                                ? "rounded-full border border-pink-400/30 bg-pink-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-pink-200"
                                : "rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400"
                            }
                          >
                            {contestant.status}
                          </span>
                        </td>
                        <td className="border-b border-zinc-900 px-4 py-4">
                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] ${typeStyles.badgeClassName}`}
                          >
                            {getContestantTypeLabel(contestant.contestant_type)}
                          </span>
                        </td>
                        <td className="border-b border-zinc-900 px-4 py-4 text-zinc-200">
                          {partner ?? "TBD"}
                        </td>
                        <td className="border-b border-zinc-900 px-4 py-4 text-sm text-zinc-400">
                          {!isActive
                            ? "Dumped from the island"
                            : partner
                              ? "Locked into the latest confirmed couple"
                              : "Still open for the next big recoupling"}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-10 text-center text-sm text-zinc-400"
                    >
                      Add contestants in admin to start filling the villa board.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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

        </section>
      </div>
    </main>
  );
}
