import { NextResponse } from "next/server";
import { sendSignal } from "@/lib/signaling-store";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const roomId = (id || "").toUpperCase();
    const body = await request.json();
    const { fromPeerId, toPeerId, type, payload, signalId, id: msgId, sessionId } = body || {};

    if (!fromPeerId || !toPeerId || !type) {
      return NextResponse.json({ error: "Missing signaling parameters." }, { status: 400 });
    }

    // Explicit security check: reject any attempt to pass chat messages over signaling
    if (type === "chat" || payload?.text || payload?.message) {
      return NextResponse.json(
        { error: "Protocol violation: Chat messages must NOT be transmitted via server signaling." },
        { status: 400 }
      );
    }

    const uniqueId = signalId || msgId || null;
    const result = sendSignal(roomId, fromPeerId, toPeerId, type, payload, uniqueId, sessionId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Signal error:", err);
    return NextResponse.json({ error: "Failed to dispatch signal." }, { status: 500 });
  }
}
