import { NextResponse } from "next/server";
import { getPushSubscriptions, sendPushToRows } from "@/lib/pushServer";

export async function POST(request) {
  try {
    const body = await request.json();
    const userId = body?.userId?.trim();

    if (!userId) {
      return NextResponse.json({ error: "Missing user id." }, { status: 400 });
    }

    const subscriptions = await getPushSubscriptions({ userId });

    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: "This player does not have any saved push subscriptions yet." },
        { status: 404 }
      );
    }

    const result = await sendPushToRows(subscriptions, {
      title: "Villa Feed test",
      body: "Push notifications are live on this device. You’re ready for round alerts.",
      url: "/chat",
      tag: "villa-feed-test",
    });

    return NextResponse.json({
      success: true,
      sentCount: result.sentCount,
      staleCount: result.staleCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to send test push." },
      { status: 500 }
    );
  }
}
