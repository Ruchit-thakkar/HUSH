import { NextResponse } from "next/server";
import { kickUser } from "@/lib/signaling-store";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const roomId = (id || "").toUpperCase();
    const body = await request.json();
    const { hostId, targetUserId } = body || {};

    if (!hostId || !targetUserId) {
      return NextResponse.json({ error: "Host ID and Target User ID are required." }, { status: 400 });
    }

    const result = kickUser(roomId, hostId, targetUserId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({ ok: true, message: "Participant removed." });
  } catch (err) {
    console.error("Kick user error:", err);
    return NextResponse.json({ error: "Failed to remove user." }, { status: 500 });
  }
}
