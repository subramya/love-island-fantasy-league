"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStoredLeagueUser, type LeagueUser } from "@/lib/leagueUser";
import { supabase } from "@/lib/supabaseClient";

type FeedMessage = {
  id: string;
  user_id: string | null;
  user_name: string;
  message_type: string | null;
  reply_to_message_id: string | null;
  message: string;
  created_at: string;
};

type EpisodeNotice = {
  created_at: string;
  id: string;
  message: string;
  user_name: string;
};

function formatFeedError(message: string) {
  if (message.includes("reply_to_message_id") || message.includes("message_type")) {
    return "The villa feed table is missing the latest reply/message fields. Run supabase/add-villa-feed-support.sql in Supabase, then refresh this page.";
  }

  if (message.includes("chat_messages")) {
    return "The villa feed table is not set up yet. Run supabase/add-chat-messages.sql in Supabase, then refresh this page.";
  }

  return message;
}

function formatMessageTimeEST(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(timestamp));
}

function formatNotificationLabel(messageType: string | null) {
  return messageType === "system" ? "Admin" : "Reply";
}

function getCurrentEasternParts() {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    weekday: values.weekday,
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function getEpisodeNotice(): EpisodeNotice | null {
  const eastern = getCurrentEasternParts();
  const isEpisodeDay = eastern.weekday !== "Wed" && eastern.weekday !== "Sat";

  if (!isEpisodeDay) {
    return null;
  }

  const dateLabel = `${eastern.year}-${String(eastern.month).padStart(2, "0")}-${String(
    eastern.day
  ).padStart(2, "0")}`;
  const createdAt = new Date().toISOString();

  if (eastern.hour < 21) {
    return {
      created_at: createdAt,
      id: `episode-upcoming-${dateLabel}`,
      message: "Episode night update: tonight’s episode starts at 9:00 PM ET. Finalize your picks before the villa opens.",
      user_name: "Villa Feed",
    };
  }

  return {
    created_at: createdAt,
    id: `episode-live-${dateLabel}`,
    message: "Episode is live now. Love Island starts at 9:00 PM ET tonight, so the villa chaos is officially open.",
    user_name: "Villa Feed",
  };
}

export default function ChatPage() {
  const [user, setUser] = useState<LeagueUser | null>(null);
  const [messages, setMessages] = useState<FeedMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
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
        .select("id, user_id, user_name, message_type, reply_to_message_id, message, created_at")
        .order("created_at", { ascending: false })
        .limit(150);

      if (!isMounted) {
        return;
      }

      if (error) {
        setErrorMessage(formatFeedError(error.message));
      } else {
        setMessages(((data ?? []) as FeedMessage[]).reverse());
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

  const messagesById = useMemo(
    () => new Map(messages.map((message) => [message.id, message])),
    [messages]
  );

  const episodeNotice = getEpisodeNotice();
  const feedItems = useMemo(() => {
    const nextItems = [...messages];

    if (episodeNotice) {
      nextItems.push({
        id: episodeNotice.id,
        user_id: null,
        user_name: episodeNotice.user_name,
        message_type: "system",
        reply_to_message_id: null,
        message: episodeNotice.message,
        created_at: episodeNotice.created_at,
      });
    }

    return nextItems.sort(
      (left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    );
  }, [episodeNotice, messages]);

  const replyTarget = replyToId ? messagesById.get(replyToId) ?? null : null;

  const sendMessage = async () => {
    setSending(true);
    setErrorMessage("");

    if (!user) {
      setErrorMessage("Log in from the home page before joining the villa feed.");
      setSending(false);
      return;
    }

    const trimmedMessage = messageDraft.trim();

    if (!trimmedMessage) {
      setErrorMessage("Write a message before posting.");
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
        message_type: "user",
        reply_to_message_id: replyToId,
        message: trimmedMessage,
        created_at: new Date().toISOString(),
      })
      .select("id, user_id, user_name, message_type, reply_to_message_id, message, created_at")
      .single();

    if (error) {
      setErrorMessage(formatFeedError(error.message));
      setSending(false);
      return;
    }

    setMessages((currentMessages) => [...currentMessages, data as FeedMessage]);
    setMessageDraft("");
    setReplyToId(null);
    setSending(false);
  };

  return (
    <main className="min-h-screen bg-transparent px-6 py-10 text-zinc-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
          <p className="text-sm font-medium uppercase tracking-[0.3em] text-emerald-300">
            Global Villa Feed
          </p>
          <h1 className="mt-3 text-4xl font-semibold">Post like the villa is watching</h1>
          <p className="mt-3 text-sm text-zinc-400">
            A live league feed for hot takes, replies, prediction updates, and episode-night alerts. Every timestamp here is shown in Eastern Time.
          </p>
        </div>

        {errorMessage ? (
          <section className="rounded-3xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
            {errorMessage}
          </section>
        ) : null}

        {!user ? (
          <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <p className="text-zinc-300">Log in from the home page before jumping into the feed.</p>
            <Link
              href="/"
              className="mt-4 inline-flex rounded-full bg-pink-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-pink-400"
            >
              Back to login
            </Link>
          </section>
        ) : (
          <>
            <section className="rounded-3xl border border-emerald-400/20 bg-zinc-950/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <div className="flex flex-col gap-4">
                <div>
                  <p className="text-sm text-zinc-400">
                    Posting as <span className="font-semibold text-zinc-100">{user.name}</span>
                  </p>
                  <p className="mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500">
                    Entire feed shown in EST • auto-refreshes every 5 seconds
                  </p>
                </div>
                {replyTarget ? (
                  <div className="rounded-2xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sky-100">Replying to {replyTarget.user_name}</p>
                        <p className="mt-2 line-clamp-3 text-zinc-200">{replyTarget.message}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setReplyToId(null)}
                        className="rounded-full border border-zinc-700 px-3 py-1 text-xs font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-zinc-100"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : null}
                <textarea
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder="Type your villa hot take..."
                  rows={4}
                  maxLength={280}
                  className="rounded-3xl border border-zinc-800 bg-zinc-900 px-4 py-4 text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-emerald-400"
                />
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-zinc-500">{messageDraft.length}/280 characters</p>
                  <button
                    type="button"
                    onClick={sendMessage}
                    disabled={sending}
                    className="rounded-full bg-gradient-to-r from-pink-500 via-emerald-400 to-yellow-300 px-5 py-3 text-sm font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {sending ? "Posting..." : replyTarget ? "Post reply" : "Post to feed"}
                  </button>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-zinc-800 bg-zinc-950/90 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">Villa feed</h2>
                <span className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-yellow-100">
                  {feedItems.length} posts
                </span>
              </div>

              {loading ? (
                <p className="mt-6 text-zinc-400">Loading the villa feed...</p>
              ) : feedItems.length > 0 ? (
                <div className="mt-6 space-y-4">
                  {feedItems.map((message) => {
                    const isSystemMessage = message.message_type === "system";
                    const replyParent =
                      message.reply_to_message_id && !message.reply_to_message_id.startsWith("episode-")
                        ? messagesById.get(message.reply_to_message_id) ?? null
                        : null;

                    return (
                      <article
                        key={message.id}
                        className={`rounded-3xl border p-4 ${
                          isSystemMessage
                            ? "border-yellow-300/30 bg-yellow-300/10"
                            : message.user_id === user.id
                              ? "border-pink-400/30 bg-pink-500/10"
                              : "border-zinc-800 bg-zinc-900"
                        }`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-zinc-100">{message.user_name}</p>
                            {isSystemMessage ? (
                              <span className="rounded-full border border-yellow-300/30 bg-yellow-300/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-yellow-100">
                                {formatNotificationLabel(message.message_type)}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">
                            {formatMessageTimeEST(message.created_at)}
                          </p>
                        </div>
                        {replyParent ? (
                          <div className="mt-3 rounded-2xl border border-zinc-800 bg-black/25 p-3 text-sm">
                            <p className="font-semibold text-zinc-300">Replying to {replyParent.user_name}</p>
                            <p className="mt-1 line-clamp-2 text-zinc-400">{replyParent.message}</p>
                          </div>
                        ) : null}
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-zinc-300">
                          {message.message}
                        </p>
                        {!isSystemMessage ? (
                          <div className="mt-4 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setReplyToId(message.id)}
                              className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/20"
                            >
                              Reply
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-6 text-zinc-400">
                  No feed posts yet. Be the first one to stir things up.
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
