"use client";

import { create } from "zustand";
import type { UserDto } from "@chat/shared";

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthState = {
  status: AuthStatus;
  user: UserDto | null;
  setLoading: () => void;
  setAuthenticated: (user: UserDto) => void;
  setUnauthenticated: () => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  user: null,
  setLoading: () => set({ status: "loading" }),
  setAuthenticated: (user) => set({ status: "authenticated", user }),
  setUnauthenticated: () => set({ status: "unauthenticated", user: null })
}));

