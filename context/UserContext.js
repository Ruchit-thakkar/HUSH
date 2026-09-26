"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { generateUserId } from "@/lib/room";

const UserContext = createContext({
  userId: "",
  regenerateUserId: () => {},
});

export function UserProvider({ children }) {
  const [userId, setUserId] = useState("");

  useEffect(() => {
    try {
      let id = sessionStorage.getItem("hush_session_user_id");
      if (!id || !id.startsWith("USER-")) {
        id = generateUserId();
        sessionStorage.setItem("hush_session_user_id", id);
      }
      setUserId(id);
    } catch {
      setUserId(generateUserId());
    }
  }, []);

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
