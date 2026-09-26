import { NextResponse } from "next/server";
import { getRoom } from "@/lib/signaling-store";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const roomId = (id || "").toUpperCase();
    const room = getRoom(roomId);

    if (!room) {
      return NextResponse.json(
        { ok: false, code: "ROOM_NOT_FOUND", error: "Room not found." },
        { status: 404 }
      );
    }

    if (room.status === "closed") {
      return NextResponse.json(
        { ok: false, code: "ROOM_CLOSED", error: "This room has been closed.", status: "closed" },
        { status: 410 }
      );
    }

    const participantCount = Object.keys(room.participants).length;
    if (participantCount >= 8) {
      return NextResponse.json(
        { ok: false, code: "ROOM_FULL", error: "Room is full." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      room: {
        id: room.id,
        hostId: room.hostId,
        status: room.status,
        hostConnected: room.hostConnected !== false,
        createdAt: room.createdAt,
        participantCount,
      },
    });
  } catch (err) {
    console.error("Get room error:", err);
    return NextResponse.json(
      { ok: false, code: "SIGNALING_ERROR", error: "Failed to fetch room status." },
      { status: 500 }
    );
  }
}
