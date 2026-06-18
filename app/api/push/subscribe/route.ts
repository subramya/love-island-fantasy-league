import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/serverSupabase";

type SubscribeBody = {
  userId?: string;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SubscribeBody;
    const endpoint = body.subscription?.endpoint?.trim();
    const p256dh = body.subscription?.keys?.p256dh?.trim();
    const auth = body.subscription?.keys?.auth?.trim();
    const userId = body.userId?.trim();

    if (!endpoint || !p256dh || !auth || !userId) {
      return NextResponse.json(
        { error: "Missing user or subscription details." },
        { status: 400 }
      );
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("push_subscriptions").upsert(
      {
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        user_agent: request.headers.get("user-agent"),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save push subscription." },
      { status: 500 }
    );
  }
}
