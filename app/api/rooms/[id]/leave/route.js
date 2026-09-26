import { NextResponse } from "next/server";
import { leaveRoom } from "@/lib/signaling-store";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const roomId = (id || "").toUpperCase();
    const body = await request.json();
    const { userId } = body || {};

    if (!userId) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    leaveRoom(roomId, userId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Leave room error:", err);
    return NextResponse.json({ error: "Failed to leave room." }, { status: 500 });
  }
}
