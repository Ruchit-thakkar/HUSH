import { NextResponse } from "next/server";
import { pollSignals } from "@/lib/signaling-store";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const roomId = (id || "").toUpperCase();
    const { searchParams } = new URL(request.url);
    const peerId = searchParams.get("peerId");

    if (!peerId) {
      return NextResponse.json({ error: "peerId query parameter is required." }, { status: 400 });
    }

    const result = pollSignals(roomId, peerId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("Poll signals error:", err);
    return NextResponse.json({ error: "Failed to poll signals." }, { status: 500 });
  }
}
