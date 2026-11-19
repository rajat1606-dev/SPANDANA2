"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { generateWaveform } from "@/lib/ecg/waveform";
import { computeCriteria } from "@/lib/ecg/criteria";
import {
  createLibraryAnalyses,
  deriveInterpretation,
} from "@/lib/case-library";
import type { EcgAnalysis } from "@/lib/ecg/types";

export type ViewId =
  | "dashboard"
  | "upload"
  | "visualization"
  | "criteria"
  | "screening"
  | "comparison"
  | "reports"
  | "research";

interface AnalysesState {
  analyses: EcgAnalysis[];
  selectedId: string | null;
  addAnalysis: (a: EcgAnalysis) => void;
  selectAnalysis: (id: string | null) => void;
  addAndSelect: (a: EcgAnalysis) => void;
  /** Seed the real PTB-XL case library when it is not present. */
  ensureLibrary: () => void;
  /** Regenerate runtime waveforms after persistence rehydration. */
  rehydrateWaveforms: () => void;
}

/**
 * The full 12-lead waveform (~60k samples) is regenerated from the compact
 * deterministic spec on load; only the spec is persisted.
 */
function regenerate(a: EcgAnalysis): EcgAnalysis {
  const waveform = generateWaveform(a.spec);
  const criteria = computeCriteria(waveform, a.meta.sex);
  // Predictions are never regenerated locally; they only ever come from the
  // FastAPI backend, so whatever the analysis already holds is preserved.
  const predictions = a.predictions ?? [];
  return {
    ...a,
    waveform,
    criteria,
    predictions,
    interpretation: deriveInterpretation({ criteria, predictions }),
    awaitingBackend: predictions.length === 0,
  };
}

/**
 * Persisted-state key. Bump STORAGE_VERSION to discard everything persisted
 * by an older build.
 *
 * Any key under the same prefix that is not the current one is dead weight:
 * zustand never reads it again, but it keeps occupying the origin's
 * localStorage budget and makes QuotaExceededError on the live key more
 * likely. The sweep below is deliberately written against the prefix rather
 * than a hand-maintained list, so bumping the version is enough on its own -
 * an explicit list of old keys is the kind of thing that gets forgotten, and
 * forgetting it silently strands the previous build's data forever.
 */
const STORAGE_PREFIX = "spandana-analyses-";
const STORAGE_VERSION = 3;  // v3: analyses carry the recording's own sampling
const STORAGE_KEY = `${STORAGE_PREFIX}v${STORAGE_VERSION}`;

function dropLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(STORAGE_PREFIX) && key !== STORAGE_KEY) {
        stale.push(key);
      }
    }
    // Collected first: removing during enumeration shifts the indices.
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    /* storage unavailable — nothing to reclaim */
  }
}

/** Newest decoded uploads kept in localStorage (analyses are newest-first). */
const MAX_PERSISTED_DECODED = 6;

function pruneForStorage(analyses: EcgAnalysis[]): EcgAnalysis[] {
  let decodedSeen = 0;
  const kept: EcgAnalysis[] = [];
  for (const a of analyses) {
    const decoded = !!a.spec.parsed;
    if (decoded) {
      decodedSeen += 1;
      if (decodedSeen > MAX_PERSISTED_DECODED) continue;
    }
    kept.push(a);
  }
  return kept;
}

/**
 * localStorage wrapper that survives QuotaExceededError: on failure it
 * progressively drops older decoded recordings and retries (twice), so a
 * large upload can never break state updates or lose the PTB-XL library.
 */
const quotaSafeLocalStorage: Storage = {
  get length() {
    try {
      return localStorage.length;
    } catch {
      return 0;
    }
  },
  clear: () => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  },
  getItem: (name) => {
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  key: (index) => {
    try {
      return localStorage.key(index);
    } catch {
      return null;
    }
  },
  removeItem: (name) => {
    try {
      localStorage.removeItem(name);
    } catch {
      /* ignore */
    }
  },
  setItem: (name, value) => {
    try {
      localStorage.setItem(name, value);
    } catch {
      // First retry: keep only the 2 newest decoded recordings.
      try {
        const parsedJson = JSON.parse(value) as {
          state?: { analyses?: { id: string; spec?: { parsed?: unknown } }[] };
        };
        const analyses = parsedJson.state?.analyses ?? [];
        const withParsed = analyses
          .filter((a) => a.spec?.parsed)
          .map((a) => a.id);
        const drop = new Set(withParsed.slice(0, Math.max(0, withParsed.length - 2)));
        const slimmed = analyses.filter((a) => !drop.has(a.id));
        parsedJson.state = { ...parsedJson.state, analyses: slimmed };
        localStorage.setItem(name, JSON.stringify(parsedJson));
      } catch {
        // Second retry: drop ALL decoded recordings, keep the light library data.
        try {
          const parsedJson = JSON.parse(value) as {
            state?: { analyses?: { id: string; spec?: { parsed?: unknown } }[] };
          };
          const analyses = (parsedJson.state?.analyses ?? []).filter(
            (a) => !a.spec?.parsed,
          );
          parsedJson.state = { ...parsedJson.state, analyses };
          localStorage.setItem(name, JSON.stringify(parsedJson));
        } catch {
          // Storage unavailable — session-only mode.
          if (process.env.NODE_ENV !== "production") {
            console.warn("SPANDANA: localStorage quota exceeded — decoded recordings kept for this session only.");
          }
        }
      }
    }
  },
};

export const useAnalysesStore = create<AnalysesState>()(
  persist(
    (set, get) => ({
      analyses: [],
      selectedId: null,
      addAnalysis: (a) => set((s) => ({ analyses: [a, ...s.analyses] })),
      selectAnalysis: (id) => set({ selectedId: id }),
      addAndSelect: (a) =>
        set((s) => ({ analyses: [a, ...s.analyses], selectedId: a.id })),
      /** Seed the real PTB-XL case library when it is not present. */
      ensureLibrary: () => {
        dropLegacyStorage();
        const current = get().analyses;
        if (!current.some((a) => a.id.startsWith("ptbxl-"))) {
          const stale = current.filter((a) => !a.id.startsWith("demo-"));
          set({ analyses: [...createLibraryAnalyses(), ...stale] });
        }
      },
      rehydrateWaveforms: () => {
        const current = get().analyses;
        if (current.some((a) => !a.waveform || !a.waveform.leads)) {
          set({ analyses: current.map(regenerate) });
        }
      },
    }),
    {
      // v2: the demo library and the local prediction simulator were removed;
      // bumping the key drops any persisted "demo-" analyses from v1, and
      // dropLegacyStorage() reclaims the space the v1 entry still occupied.
      name: STORAGE_KEY,
      storage: createJSONStorage(() => quotaSafeLocalStorage),
      partialize: (state) => ({
        // Decoded recordings carry up to ~250 KB of samples each — keep only
        // the most recent MAX_PERSISTED_DECODED so the quota stays healthy.
        analyses: pruneForStorage(state.analyses).map((a) => ({
          ...a,
          waveform: undefined,
        })),
        selectedId: state.selectedId,
      }),
    },
  ),
);

/** Select the active analysis, or fall back to the first available one. */
export function useSelectedAnalysis(): EcgAnalysis | null {
  const analyses = useAnalysesStore((s) => s.analyses);
  const selectedId = useAnalysesStore((s) => s.selectedId);
  const selected = analyses.find((a) => a.id === selectedId);
  return selected ?? analyses[0] ?? null;
}
