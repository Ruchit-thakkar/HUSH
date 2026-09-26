import { NextResponse } from "next/server";
import { closeRoom } from "@/lib/signaling-store";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const roomId = (id || "").toUpperCase();
    const body = await request.json();
    const { hostId } = body || {};

    if (!hostId) {
      return NextResponse.json({ error: "Host ID is required." }, { status: 400 });
    }

    const result = closeRoom(roomId, hostId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({ ok: true, message: "Room closed." });
  } catch (err) {
    console.error("Close room error:", err);
    return NextResponse.json({ error: "Failed to close room." }, { status: 500 });
  }
}
