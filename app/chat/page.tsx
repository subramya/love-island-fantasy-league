"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredLeagueUser, type LeagueUser } from "@/lib/leagueUser";
import { supabase } from "@/lib/supabaseClient";

type ChatMessage = {
  id: string;
  user_id: string;
  user_name: string;
  message: string;
  created_at: string;
};

function formatChatError(message: string) {
  if (message.includes("chat_messages")) {
    return "The villa chat table is not set up yet. Run supabase/add-chat-messages.sql in Supabase, then refresh this page.";
  }

  return message;
}

function formatMessageTime(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export default function ChatPage() {
  const [user, setUser] = useState<LeagueUser | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    setUser(getStoredLeagueUser());
  }, []);

  useEffect(() => {
    let isMounted = true;

    const loadMessages = async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, user_id, user_name, message, created_at")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!isMounted) {
        return;
      }

      if (error) {
        setErrorMessage(formatChatError(error.message));
      } else {
        setMessages(((data ?? []) as ChatMessage[]).reverse());
      }

      setLoading(false);
    };

    void loadMessages();
    const intervalId = window.setInterval(() => {
      void loadMessages();
    }, 5000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const sendMessage = async () => {
    setSending(true);
    setErrorMessage("");

    if (!user) {
      setErrorMessage("Log in from the home page before joining the villa chat.");
      setSending(false);
      return;
    }

    const trimmedMessage = messageDraft.trim();

    if (!trimmedMessage) {
      setErrorMessage("Write a message before sending.");
      setSending(false);
      return;
    }

    if (trimmedMessage.length > 280) {
      setErrorMessage("Keep it to 280 characters or less.");
      setSending(false);
      return;
    }

    const { data, error } = await supabase
      .from("chat_messages")
      .insert({
        user_id: user.id,
        user_name: user.name,
        message: trimmedMessage,
      })
      .select("id, user_id, user_name, message, created_at")
      .single();

    if (error) {
      setErrorMessage(formatChatError(error.message));
      setSending(false);
      return;
    }

    setMessages((currentMessages) => [...currentMessages, data as ChatMessage]);
    setMessageDraft("");
    setSending(false);
  };

  return (
    <main className="min-h-screen bg-transparent px-6 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-sky-300">
            Global Villa Chat
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Spill the tea live</h1>
          <p className="mt-3 text-sm text-zinc-400">
            One shared chat for the whole league to react to recouplings, dumpings, bombshell chaos, and leaderboard swings.
          </p>
        </div>

        {errorMessage ? (
          <section className="rounded-3xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
            {errorMessage}
          </section>
        ) : null}

        {!user ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <p className="text-zinc-300">Log in from the home page before jumping into the chat.</p>
            <Link
              href="/"
              className="mt-4 inline-flex rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
            >
              Back to login
            </Link>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-sky-400/20 bg-zinc-950/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm text-zinc-400">
                    Chatting as <span className="font-semibold text-zinc-100">{user.name}</span>
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Auto-refreshes every 5 seconds
                  </p>
                </div>
                <textarea
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder="Type your villa hot take..."
                  rows={4}
                  maxLength={280}
                  className="rounded-3xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-400"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-500">{messageDraft.length}/280 characters</p>
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={sending}
                    className="rounded-full bg-gradient-to-r from-pink-500 via-sky-400 to-yellow-300 px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {sending ? "Sending..." : "Send message"}
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">Villa feed</h2>
                <span className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100">
                  {messages.length} messages
                </span>
              </div>

              {loading ? (
                <p className="mt-6 text-zinc-400">Loading the villa chat...</p>
              ) : messages.length > 0 ? (
                <div className="mt-6 space-y-4">
                  {messages.map((message) => (
                    <article
                      key={message.id}
                      className={`rounded-3xl border p-4 ${
                        message.user_id === user.id
                          ? "border-pink-400/30 bg-pink-500/10"
                          : "border-zinc-800 bg-zinc-900"
                      }`}
                    >
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="font-semibold text-zinc-100">{message.user_name}</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                          {formatMessageTime(message.created_at)}
                        </p>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                        {message.message}
                      </p>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-6 text-zinc-400">
                  No messages yet. Be the first one to stir things up.
                </p>
              )}
            </section>
          </>
        )}

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
            href="/leaderboard"
            className="rounded-full border border-zinc-700 bg-zinc-900 px-5 py-3 text-sm font-semibold text-zinc-100 transition hover:border-sky-400 hover:text-sky-300"
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
