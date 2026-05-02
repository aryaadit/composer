"use client";

// Client context for saved venue IDs. Hydrated once from the server,
// then mutated optimistically on heart-button taps. Reverts + toasts
// on API failure.

import {
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";
import { useToast } from "@/components/ui/Toast";

interface SavedVenuesContextValue {
  savedIds: Set<string>;
  toggle: (venueId: string) => Promise<void>;
}

const SavedVenuesContext = createContext<SavedVenuesContextValue | null>(null);

export function useSavedVenues(): SavedVenuesContextValue {
  const ctx = useContext(SavedVenuesContext);
  if (!ctx) throw new Error("useSavedVenues requires SavedVenuesProvider");
  return ctx;
}

export function SavedVenuesProvider({
  initialIds,
  children,
}: {
  initialIds: string[];
  children: React.ReactNode;
}) {
  const [savedIds, setSavedIds] = useState<Set<string>>(
    () => new Set(initialIds)
  );
  const toast = useToast();

  const toggle = useCallback(
    async (venueId: string) => {
      const wasSaved = savedIds.has(venueId);
      const action = wasSaved ? "unsave" : "save";

      // Optimistic update.
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.delete(venueId);
        else next.add(venueId);
        return next;
      });

      try {
        const res = await fetch("/api/save-venue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ venueId, action }),
        });
        const data = (await res.json()) as { ok: boolean; error?: string };
        if (!data.ok) throw new Error(data.error ?? "Save failed");
      } catch {
        // Revert on failure.
        setSavedIds((prev) => {
          const reverted = new Set(prev);
          if (wasSaved) reverted.add(venueId);
          else reverted.delete(venueId);
          return reverted;
        });
        toast.show({ message: "Couldn't save. Try again." });
      }
    },
    [savedIds, toast]
  );

  return (
    <SavedVenuesContext.Provider value={{ savedIds, toggle }}>
      {children}
    </SavedVenuesContext.Provider>
  );
}
