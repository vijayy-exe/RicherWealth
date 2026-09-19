"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface HouseholdState {
  /** null = "Personal" (just me) view. */
  activeHouseholdId: string | null;
  setActiveHousehold: (householdId: string | null) => void;
}

export const useHouseholdStore = create<HouseholdState>()(
  persist(
    (set) => ({
      activeHouseholdId: null,
      setActiveHousehold: (activeHouseholdId) => set({ activeHouseholdId }),
    }),
    { name: "richer-active-household" },
  ),
);
