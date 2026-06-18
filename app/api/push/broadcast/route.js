import { NextResponse } from "next/server";
import {
  getPushSubscriptions,
  insertSystemFeedMessage,
  sendPushToRows,
} from "@/lib/pushServer";

export async function POST(request) {
  try {
    const body = await request.json();
    const title = body?.title?.trim();
    const message = body?.message?.trim();
    const url = body?.url?.trim() || "/chat";
    const postToFeed = Boolean(body?.postToFeed);

    if (!title || !message) {
      return NextResponse.json(
        { error: "Push alerts need both a title and message." },
        { status: 400 }
      );
    }

    const subscriptions = await getPushSubscriptions();

    if (subscriptions.length === 0) {
      return NextResponse.json(
        { error: "No push subscribers are registered yet." },
        { status: 404 }
      );
    }

    if (postToFeed) {
      await insertSystemFeedMessage(message);
    }

    const result = await sendPushToRows(subscriptions, {
      title,
      body: message,
      url,
      tag: "villa-feed-admin-alert",
    });

    return NextResponse.json({
      success: true,
      sentCount: result.sentCount,
      staleCount: result.staleCount,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to broadcast push alert." },
      { status: 500 }
    );
  }
}
