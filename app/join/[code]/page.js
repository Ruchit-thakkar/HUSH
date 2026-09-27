"use client";

import React, { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { isValidRoomId } from "@/lib/room";
import { LogIn, AlertCircle, Loader2, ArrowLeft } from "lucide-react";

export default function JoinByLinkPage({ params }) {
  const unwrappedParams = use(params);
  const rawCode = (unwrappedParams.code || "").toUpperCase();
  const router = useRouter();

  const [error, setError] = useState(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isRoomValid, setIsRoomValid] = useState(null);

  // Pre-validate room code format
  const validFormat = isValidRoomId(rawCode);

  useEffect(() => {
    if (!validFormat) {
      setError("Room not found.");
      return;
    }

    let isMounted = true;
    async function checkRoom() {
      try {
        const res = await fetch(`/api/rooms/${rawCode}`, {
          cache: "no-store",
        });
        const data = await res.json().catch(() => ({}));

        if (!isMounted) return;

        if (!res.ok) {
          if (res.status === 404 || data.code === "ROOM_NOT_FOUND") {
            setError("Room not found.");
          } else if (res.status === 410 || data.code === "ROOM_CLOSED") {
            setError("This room has been closed.");
          } else if (data.code === "ROOM_FULL") {
            setError("Room is full.");
          } else {
            setError("Unable to connect to the room.");
          }
          setIsRoomValid(false);
          return;
        }

        if (data.room?.participantCount >= 8) {
          setError("Room is full.");
          setIsRoomValid(false);
          return;
        }

        setIsRoomValid(true);
      } catch {
        if (isMounted) {
          setError("Unable to connect to the room.");
          setIsRoomValid(false);
        }
      }
    }

    checkRoom();

    return () => {
      isMounted = false;
    };
  }, [rawCode, validFormat]);

  const handleJoin = async (e) => {
    e?.preventDefault();
    if (!validFormat) return;

    setIsChecking(true);
    setError(null);

    try {
      const res = await fetch(`/api/rooms/${rawCode}`, {
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
          setError("Unable to connect to the room.");
        }
        setIsChecking(false);
        return;
      }

      if (data.room?.participantCount >= 8) {
        setError("Room is full.");
        setIsChecking(false);
        return;
      }

      router.push(`/room/${rawCode}`);
    } catch {
      setError("Unable to connect to the room.");
      setIsChecking(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfb] dark:bg-[#09090b] text-[#09090b] dark:text-[#f4f4f5] transition-colors">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center max-w-md mx-auto w-full">
        <div className="w-full rounded-2xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 p-6 sm:p-8 shadow-xs">
          {/* Logo & Header */}
          <div className="flex flex-col items-center mb-6">
            <div className="w-12 h-12 rounded-xl bg-neutral-900 flex items-center justify-center border border-neutral-200 dark:border-neutral-800 mb-3 shadow-xs">
              <Image
                src="/logo.png"
                alt="HUSH"
                width={36}
                height={36}
                className="w-9 h-9 object-cover rounded-lg"
                priority
              />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 font-mono">
              HUSH
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
              You&apos;ve been invited to join a room.
            </p>
          </div>

          {/* Room Display Card */}
          <div className="p-4 rounded-xl bg-neutral-50 dark:bg-neutral-950 border border-neutral-200 dark:border-neutral-800 mb-5">
            <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider block mb-1">
              Room
            </span>
            <span className="text-2xl font-mono font-bold tracking-widest text-neutral-900 dark:text-neutral-100">
              {rawCode}
            </span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 rounded-xl border border-red-200 dark:border-red-950/80 bg-red-50 dark:bg-red-950/20 text-xs text-red-600 dark:text-red-400 flex items-center gap-2 text-left mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Join Room Button */}
          <button
            type="button"
            onClick={handleJoin}
            disabled={isChecking || isRoomValid === false}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-950 font-medium text-sm hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-xs"
          >
            {isChecking ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Join Room</span>
              </>
            )}
          </button>

          <div className="mt-4 pt-4 border-t border-neutral-100 dark:border-neutral-800/80 flex justify-center">
            <Link
              href="/"
              className="text-xs text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return Home</span>
            </Link>
          </div>
        </div>

        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 mt-6 font-mono">
          Room activity is temporary and is not stored by HUSH.
        </p>
      </main>
    </div>
  );
}
