import { NextResponse } from "next/server";
import { createRoom } from "@/lib/signaling-store";
import { generateRoomId, isValidRoomId } from "@/lib/room";

export async function POST(request) {
  try {
    const body = await request.json();
    const { hostId, customRoomId } = body || {};

    if (!hostId) {
      return NextResponse.json({ error: "Host User ID is required." }, { status: 400 });
    }

    const roomId = customRoomId && isValidRoomId(customRoomId) ? customRoomId : generateRoomId();
    const room = createRoom(roomId, hostId);

    return NextResponse.json({
      ok: true,
      room: {
        id: room.id,
        hostId: room.hostId,
        status: room.status,
        createdAt: room.createdAt,
        participants: Object.values(room.participants),
      },
    });
  } catch (err) {
    console.error("Create room error:", err);
    return NextResponse.json({ error: "Failed to create room." }, { status: 500 });
  }
}
