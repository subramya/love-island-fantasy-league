"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import {
  clearStoredLeagueUser,
  getStoredLeagueUser,
  storeLeagueUser,
  type LeagueUser,
} from "@/lib/leagueUser";
import { supabase } from "@/lib/supabaseClient";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function ProfilePage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [user, setUser] = useState<LeagueUser | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const storedUser = getStoredLeagueUser();
    setUser(storedUser);
    setName(storedUser?.name ?? "");
    setEmail(storedUser?.email ?? "");
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
    setName(updatedUser.name);
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
    <main className="min-h-screen bg-black px-4 py-5 text-zinc-100 sm:px-6 sm:py-10">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 sm:gap-6">
        <section className="rounded-[2rem] border border-zinc-800 bg-zinc-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-pink-300">
            Profile
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Player profile</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Log in with your league name, save your alert email, and jump straight back into the villa.
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

        <section className="rounded-[2rem] border border-pink-500/25 bg-zinc-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
          {user ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold">{user.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">
                    Update your alert email here or sign out if you want to switch players.
                  </p>
                </div>
                <div className="rounded-full border border-pink-400/30 bg-pink-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-pink-200">
                  Signed in
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
                    className="min-h-11 rounded-2xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-base text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
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
                    className="min-h-12 rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? "Saving..." : "Save alert email"}
                  </button>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="min-h-12 rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-semibold text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
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
                    className="min-h-11 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-yellow-300"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium text-zinc-300">
                  Email for round alerts
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                    className="min-h-11 rounded-2xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-base text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
                  />
                  <span className="text-xs text-zinc-500">
                    Optional, but if you use the same email later we can log you back into the same profile.
                  </span>
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex min-h-12 items-center justify-center rounded-full bg-gradient-to-r from-pink-500 via-fuchsia-500 to-yellow-300 px-5 py-3 text-sm font-semibold text-black transition hover:from-pink-400 hover:via-sky-400 hover:to-yellow-200 disabled:cursor-not-allowed disabled:from-pink-300 disabled:to-yellow-200"
                >
                  {submitting ? "Logging in..." : "Continue"}
                </button>
              </form>
            </>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          <Link
            href="/predict"
            className="flex min-h-12 items-center justify-center rounded-2xl bg-sky-400 px-4 text-sm font-semibold text-black transition hover:bg-sky-300"
          >
            Prediction Rounds
          </Link>
          <Link
            href="/admin"
            className="flex min-h-12 items-center justify-center rounded-2xl border border-zinc-700 bg-zinc-900 px-4 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800"
          >
            Open admin
          </Link>
        </section>
      </div>
    </main>
  );
}
