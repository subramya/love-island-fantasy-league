import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/serverSupabase";

type UnsubscribeBody = {
  endpoint?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as UnsubscribeBody;
    const endpoint = body.endpoint?.trim();

    if (!endpoint) {
      return NextResponse.json({ error: "Missing subscription endpoint." }, { status: 400 });
    }

    const supabase = createServerSupabase();
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to remove push subscription." },
      { status: 500 }
    );
  }
}
