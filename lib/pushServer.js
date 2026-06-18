import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";

function createServerSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables.");
  }

  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getPushConfig() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@example.com";

  if (!publicKey || !privateKey) {
    throw new Error(
      "Missing VAPID keys. Add NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY before enabling push notifications."
    );
  }

  return {
    publicKey,
    privateKey,
    subject,
  };
}

export function ensurePushConfigured() {
  const config = getPushConfig();

  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);

  return config;
}

function createPushPayload(payload) {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/chat",
    icon: payload.icon ?? "/apple-icon",
    badge: payload.badge ?? "/apple-icon",
    tag: payload.tag ?? "villa-feed-alert",
  });
}

export async function sendPushToRows(rows, payload) {
  ensurePushConfigured();

  const supabase = createServerSupabase();
  const staleEndpoints = [];
  let sentCount = 0;

  await Promise.all(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: row.endpoint,
            keys: {
              p256dh: row.p256dh,
              auth: row.auth,
            },
          },
          createPushPayload(payload)
        );
        sentCount += 1;
      } catch (error) {
        const statusCode = error?.statusCode ?? error?.status ?? null;

        if (statusCode === 404 || statusCode === 410) {
          staleEndpoints.push(row.endpoint);
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    await supabase.from("push_subscriptions").delete().in("endpoint", staleEndpoints);
  }

  return {
    sentCount,
    staleCount: staleEndpoints.length,
  };
}

export async function insertSystemFeedMessage(message) {
  const supabase = createServerSupabase();

  await supabase.from("chat_messages").insert({
    user_id: null,
    user_name: "Villa Feed",
    message_type: "system",
    reply_to_message_id: null,
    message,
    created_at: new Date().toISOString(),
  });
}

export async function getPushSubscriptions(filter = {}) {
  const supabase = createServerSupabase();
  let query = supabase
    .from("push_subscriptions")
    .select("id, user_id, endpoint, p256dh, auth, user_agent");

  if (filter.userId) {
    query = query.eq("user_id", filter.userId);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}
