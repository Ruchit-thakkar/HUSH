import { NextResponse } from "next/server";
import { joinRoom } from "@/lib/signaling-store";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const roomId = (id || "").toUpperCase();
    const body = await request.json();
    const { userId } = body || {};

    if (!userId) {
      return NextResponse.json(
        { ok: false, code: "INVALID_USER", error: "User ID is required." },
        { status: 400 }
      );
    }

    const result = joinRoom(roomId, userId);
    if (!result.ok) {
      const status =
        result.code === "ROOM_NOT_FOUND" ? 404 : result.code === "ROOM_CLOSED" ? 410 : 400;
      return NextResponse.json(result, { status });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Join room error:", err);
    return NextResponse.json(
      { ok: false, code: "SIGNALING_ERROR", error: "Failed to join room." },
      { status: 500 }
    );
  }
}
