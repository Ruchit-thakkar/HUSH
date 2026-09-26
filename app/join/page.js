"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { formatRoomInput, isValidRoomId } from "@/lib/room";
import { LogIn, AlertCircle, Loader2 } from "lucide-react";

function JoinRoomForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    const codeParam = searchParams.get("code");
    if (codeParam) {
      setRoomCode(formatRoomInput(codeParam));
    }
  }, [searchParams]);

  const handleInputChange = (e) => {
    const formatted = formatRoomInput(e.target.value);
    setRoomCode(formatted);
    if (error) setError(null);
  };

  const handleJoin = async (e) => {
    e?.preventDefault();
    const cleanCode = roomCode.trim().toUpperCase();

    if (!isValidRoomId(cleanCode)) {
      setError("Please enter a valid room code (e.g. H7K9-X2P4).");
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const res = await fetch(`/api/rooms/${cleanCode}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 404 || data.code === "ROOM_NOT_FOUND") {
          setError("Room not found.");
        } else if (res.status === 410 || data.code === "ROOM_CLOSED") {
          setError("This room has been closed.");
        } else if (data.code === "ROOM_FULL") {
          setError("Room is full.");
        } else {
          // Explicitly differentiate signaling/network error from Room Not Found!
          setError("Unable to establish connection. Signaling temporarily unavailable.");
        }
        setIsChecking(false);
        return;
      }

      if (data.room?.participantCount >= 8) {
        setError("Room is full.");
        setIsChecking(false);
        return;
      }

      router.push(`/room/${cleanCode}`);
    } catch {
      // Differentiate fetch/network failure from Room Not Found!
      setError("Unable to establish connection. Please check your network and try again.");
      setIsChecking(false);
    }
  };

  return (
    <div className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8 shadow-xs">
      <h2 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 mb-2">
        Join Room
      </h2>
      <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-6">
        Enter the temporary room code provided by the host.
      </p>

      <form onSubmit={handleJoin} className="space-y-4">
        <div className="text-left">
          <label
            htmlFor="room-code-input"
            className="text-[11px] font-mono uppercase tracking-wider text-neutral-500 dark:text-neutral-400 block mb-1.5"
          >
            Enter Room Code
          </label>
          <input
            id="room-code-input"
            type="text"
            value={roomCode}
            onChange={handleInputChange}
            placeholder="H7K9-X2P4"
            maxLength={9}
            autoFocus
            className="w-full font-mono text-center text-xl sm:text-2xl font-semibold tracking-widest bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 rounded-xl py-3 px-4 text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-300 dark:placeholder:text-neutral-700 focus:outline-none focus:border-neutral-400 dark:focus:border-neutral-600 transition-colors uppercase"
            autoComplete="off"
            spellCheck="false"
          />
        </div>

        {error && (
          <div className="p-3 rounded-lg border border-red-200 dark:border-red-950/80 bg-red-50 dark:bg-red-950/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2 text-left">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={!roomCode || isChecking}
          className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 font-medium text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
        >
          {isChecking ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Checking Room...</span>
            </>
          ) : (
            <>
              <LogIn className="w-4 h-4" />
              <span>Join Room</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}

export default function JoinPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5] transition-colors">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center max-w-md mx-auto w-full">
        <Suspense fallback={<div className="text-xs font-mono text-neutral-400">Loading...</div>}>
          <JoinRoomForm />
        </Suspense>

        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-6 font-mono">
          Messages will only exist during your active connection.
        </p>
      </main>
    </div>
  );
}
