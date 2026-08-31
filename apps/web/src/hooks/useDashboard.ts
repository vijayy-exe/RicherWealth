"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:4000";

const DASHBOARD_QUERY = /* GraphQL */ `
  query DashboardSummary {
    dashboardSummary {
      totalNetWorth
      todayChangeAbs
      todayChangePct
      monthChangeAbs
      monthChangePct
      yearChangeAbs
      yearChangePct
      emergencyFundHealth
      debtRatio
      hasAssets
      baseCurrency
      assetAllocation {
        category
        valueInBase
        percentage
      }
      snapshots {
        date
        netWorth
      }
    }
  }
`;

export interface DashboardSummary {
  totalNetWorth: number;
  todayChangeAbs: number;
  todayChangePct: number;
  monthChangeAbs: number;
  monthChangePct: number;
  yearChangeAbs: number;
  yearChangePct: number;
  emergencyFundHealth: number;
  debtRatio: number;
  hasAssets: boolean;
  baseCurrency: string;
  assetAllocation: Array<{ category: string; valueInBase: number; percentage: number }>;
  snapshots: Array<{ date: string; netWorth: number }>;
}

async function fetchDashboard(token: string): Promise<DashboardSummary> {
  const res = await fetch(`${API_URL}/graphql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query: DASHBOARD_QUERY }),
  });

  if (!res.ok) throw new Error("Failed to fetch dashboard data");

  const json = (await res.json()) as {
    data?: { dashboardSummary: DashboardSummary };
    errors?: Array<{ message: string }>;
  };

  if (json.errors?.length) throw new Error(json.errors[0]?.message ?? "GraphQL error");
  if (!json.data?.dashboardSummary) throw new Error("No dashboard data returned");

  return json.data.dashboardSummary;
}

export function useDashboard() {
  const supabase = createClient();

  return useQuery({
    queryKey: ["dashboard", "summary"],
    queryFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("No session");
      return fetchDashboard(session.access_token);
    },
    refetchInterval: 30_000, // refresh every 30s
    staleTime: 10_000,
    retry: 2,
  });
}
