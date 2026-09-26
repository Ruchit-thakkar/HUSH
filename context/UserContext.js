"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { generateUserId } from "@/lib/room";

const UserContext = createContext({
  userId: "",
  regenerateUserId: () => {},
});

function getInitialUserId() {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem("hush_session_user_id");
    if (!id || !id.startsWith("USER-")) {
      id = generateUserId();
      sessionStorage.setItem("hush_session_user_id", id);
    }
    return id;
  } catch {
    return generateUserId();
  }
}

export function UserProvider({ children }) {
  const [userId, setUserId] = useState(getInitialUserId);

  useEffect(() => {
    if (!userId) {
      setUserId(getInitialUserId());
    }
  }, [userId]);

  const regenerateUserId = () => {
    const newId = generateUserId();
    try {
      sessionStorage.setItem("hush_session_user_id", newId);
    } catch {}
    setUserId(newId);
  };

  return (
    <UserContext.Provider value={{ userId, regenerateUserId }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
