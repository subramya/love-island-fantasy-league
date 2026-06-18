"use client";

import { useEffect, useMemo, useState } from "react";
import type { LeagueUser } from "@/lib/leagueUser";

const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);

  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isStandaloneDisplayMode() {
  if (typeof window === "undefined") {
    return false;
  }

  const iosNavigator = window.navigator as Navigator & { standalone?: boolean };

  return (
    window.matchMedia("(display-mode: standalone)").matches || iosNavigator.standalone === true
  );
}

type PushSettingsProps = {
  user: LeagueUser | null;
};

export function PushSettings({ user }: PushSettingsProps) {
  const [isSupported, setIsSupported] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<"enable" | "disable" | "test" | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const isIos = useMemo(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return /iPhone|iPad|iPod/i.test(window.navigator.userAgent);
  }, []);

  useEffect(() => {
    let isMounted = true;

    const syncSubscriptionState = async () => {
      const supportsPush =
        typeof window !== "undefined" &&
        "serviceWorker" in navigator &&
        "PushManager" in window &&
        "Notification" in window;

      if (!supportsPush) {
        if (isMounted) {
          setIsSupported(false);
          setLoading(false);
        }
        return;
      }

      setIsSupported(true);
      setIsStandalone(isStandaloneDisplayMode());
      setPermission(Notification.permission);

      try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();

        if (!isMounted) {
          return;
        }

        setIsSubscribed(Boolean(subscription));

        if (subscription && user) {
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: user.id,
              subscription: subscription.toJSON(),
            }),
          });
        }
      } catch {
        if (isMounted) {
          setIsSubscribed(false);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    void syncSubscriptionState();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const handleEnableNotifications = async () => {
    setPendingAction("enable");
    setErrorMessage("");
    setSuccessMessage("");

    if (!user) {
      setErrorMessage("Log in with your league profile first so we know which device to notify.");
      setPendingAction(null);
      return;
    }

    if (!isSupported) {
      setErrorMessage("This browser does not support web push notifications.");
      setPendingAction(null);
      return;
    }

    if (!vapidPublicKey) {
      setErrorMessage(
        "Push notifications are not configured yet. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY first."
      );
      setPendingAction(null);
      return;
    }

    if (isIos && !isStandalone) {
      setErrorMessage(
        "On iPhone, first open this site in Safari, tap Share, choose Add to Home Screen, then open the installed app and enable notifications from here."
      );
      setPendingAction(null);
      return;
    }

    try {
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        setErrorMessage("Notifications were not allowed on this device.");
        setPendingAction(null);
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
        });
      }

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
          subscription: subscription.toJSON(),
        }),
      });

      const payload = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save this device for notifications.");
      }

      setIsSubscribed(true);
      setSuccessMessage("This device is ready for Villa Feed push notifications.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to enable push notifications."
      );
    }

    setPendingAction(null);
  };

  const handleDisableNotifications = async () => {
    setPendingAction("disable");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        setIsSubscribed(false);
        setSuccessMessage("Notifications were already disabled on this device.");
        setPendingAction(null);
        return;
      }

      await fetch("/api/push/unsubscribe", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          endpoint: subscription.endpoint,
        }),
      });

      await subscription.unsubscribe();
      setIsSubscribed(false);
      setSuccessMessage("Push notifications were removed from this device.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to disable notifications right now."
      );
    }

    setPendingAction(null);
  };

  const handleSendTest = async () => {
    if (!user) {
      return;
    }

    setPendingAction("test");
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const response = await fetch("/api/push/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      const payload = (await response.json()) as { error?: string; sentCount?: number };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to send the test notification.");
      }

      setSuccessMessage(
        payload.sentCount
          ? `Test push sent to ${payload.sentCount} device${payload.sentCount === 1 ? "" : "s"}.`
          : "Test push sent."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to send the test notification."
      );
    }

    setPendingAction(null);
  };

  return (
    <section className="rounded-[2rem] border border-sky-400/20 bg-zinc-950 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] sm:p-8">
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-sky-300">
        App & notifications
      </p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight">Install the villa app</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Add the site to your home screen, then enable Villa Feed push alerts for new rounds,
        leaderboard drops, and admin updates.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">Install</p>
          <p className="mt-2 text-sm text-zinc-200">
            {isIos
              ? "Safari -> Share -> Add to Home Screen"
              : "Use your browser install prompt or app menu"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            App mode
          </p>
          <p className="mt-2 text-sm text-zinc-200">
            {isStandalone ? "Opened from Home Screen" : "Browser tab"}
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Permission
          </p>
          <p className="mt-2 text-sm text-zinc-200">
            {loading ? "Checking..." : permission === "granted" ? "Allowed" : permission}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-4">
        <p className="text-sm font-semibold text-zinc-100">Push status</p>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          {!isSupported
            ? "This browser does not support web push notifications."
            : isSubscribed
              ? "This device is subscribed to Villa Feed push alerts."
              : "This device is not subscribed yet."}
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleEnableNotifications}
            disabled={pendingAction !== null || !isSupported}
            className="min-h-12 rounded-full bg-sky-400 px-5 text-sm font-semibold text-black transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:bg-sky-200"
          >
            {pendingAction === "enable" ? "Enabling..." : isSubscribed ? "Refresh subscription" : "Enable notifications"}
          </button>
          <button
            type="button"
            onClick={handleSendTest}
            disabled={pendingAction !== null || !user || !isSubscribed}
            className="min-h-12 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-300 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500"
          >
            {pendingAction === "test" ? "Sending test..." : "Send test notification"}
          </button>
          <button
            type="button"
            onClick={handleDisableNotifications}
            disabled={pendingAction !== null || !isSubscribed}
            className="min-h-12 rounded-full border border-zinc-700 bg-zinc-900 px-5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-500"
          >
            {pendingAction === "disable" ? "Removing..." : "Disable notifications"}
          </button>
        </div>
      </div>

      {errorMessage ? (
        <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-950/40 p-4 text-sm text-red-200">
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 text-sm text-emerald-200">
          {successMessage}
        </div>
      ) : null}
    </section>
  );
}
