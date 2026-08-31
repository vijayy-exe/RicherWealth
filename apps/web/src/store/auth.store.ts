"use client";

import { create } from "zustand";
import type { User as SupabaseUser } from "@supabase/supabase-js";

import type { AuthUser } from "@richer/shared-types";

interface AuthState {
  supabaseUser: SupabaseUser | null;
  user: AuthUser | null;
  isLoading: boolean;
  isInitialized: boolean;
  setSupabaseUser: (user: SupabaseUser | null) => void;
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  supabaseUser: null,
  user: null,
  isLoading: true,
  isInitialized: false,

  setSupabaseUser: (user) => set({ supabaseUser: user }),
  setUser: (user) => set({ user }),
  setLoading: (isLoading) => set({ isLoading }),
  setInitialized: () => set({ isInitialized: true, isLoading: false }),
  reset: () =>
    set({
      supabaseUser: null,
      user: null,
      isLoading: false,
      isInitialized: true,
    }),
}));
