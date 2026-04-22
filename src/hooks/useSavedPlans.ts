"use client";

// Shared hook for loading, deleting, and renaming saved itineraries.
// Used by both HomeScreen and SavedPlansList on the profile page.

import { useCallback, useEffect, useState } from "react";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { SavedItinerary } from "@/types";
import type { PostgrestError } from "@supabase/supabase-js";

interface UseSavedPlansOptions {
  userId: string | null;
  limit?: number;
}

interface UseSavedPlansResult {
  plans: SavedItinerary[];
  loading: boolean;
  deletePlan: (id: string) => Promise<void>;
  renamePlan: (id: string, customName: string | null) => void;
}

export function useSavedPlans({
  userId,
  limit,
}: UseSavedPlansOptions): UseSavedPlansResult {
  const [plans, setPlans] = useState<SavedItinerary[]>([]);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let query = getBrowserSupabase()
      .from("composer_saved_itineraries")
      .select("*")
      .order("created_at", { ascending: false });
    if (limit) query = query.limit(limit);

    query.then(
      ({
        data,
        error,
      }: {
        data: SavedItinerary[] | null;
        error: PostgrestError | null;
      }) => {
        if (cancelled) return;
        if (error) {
          console.error("[useSavedPlans] load failed:", error.message);
        }
        setPlans(data ?? []);
        setLoadedFor(userId);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [userId, limit]);

  const loading = userId != null && loadedFor !== userId;

  const deletePlan = useCallback(
    async (id: string) => {
      const prev = plans;
      setPlans((p) => p.filter((plan) => plan.id !== id));
      const { error } = await getBrowserSupabase()
        .from("composer_saved_itineraries")
        .delete()
        .eq("id", id);
      if (error) {
        console.error("[useSavedPlans] delete failed:", error.message);
        setPlans(prev);
      }
    },
    [plans]
  );

  const renamePlan = useCallback(
    (id: string, customName: string | null) => {
      setPlans((p) =>
        p.map((plan) =>
          plan.id === id ? { ...plan, custom_name: customName } : plan
        )
      );
    },
    []
  );

  return { plans, loading, deletePlan, renamePlan };
}
