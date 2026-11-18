"use client";

/**
 * SPANDANA — AI Cardiac Intelligence · application shell.
 *
 * Single-page research workspace: the sidebar switches modules via state,
 * mirrored to the URL hash (#/screening …) so views are deep-linkable and
 * the browser back/forward buttons work. All data flows through the
 * Zustand analyses store, which seeds the real PTB-XL case library on first
 * load and rehydrates uploaded analyses from localStorage.
 */

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { DashboardView } from "@/components/views/DashboardView";
import { UploadView } from "@/components/views/UploadView";
import { VisualizationView } from "@/components/views/VisualizationView";
import { CriteriaView } from "@/components/views/CriteriaView";
import { ScreeningView } from "@/components/views/ScreeningView";
import { ComparisonView } from "@/components/views/ComparisonView";
import { ReportsView } from "@/components/views/ReportsView";
import { ResearchView } from "@/components/views/ResearchView";
import { ALL_VIEW_IDS } from "@/lib/nav";
import { useAnalysesStore, type ViewId } from "@/store/analyses";

function ShellSkeleton() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fb]">
      <div className="mx-auto w-full max-w-6xl flex-1 space-y-4 px-6 py-10">
        <div className="h-36 animate-pulse rounded-xl bg-[#e4eaf2]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[#e4eaf2]" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="h-64 animate-pulse rounded-xl bg-[#e4eaf2] lg:col-span-2" />
          <div className="h-64 animate-pulse rounded-xl bg-[#e4eaf2]" />
        </div>
        <p className="text-center text-xs text-muted-foreground">Loading SPANDANA workspace…</p>
      </div>
    </div>
  );
}

/** Read the current view from the URL hash (defaults to dashboard). */
function viewFromHash(): ViewId {
  if (typeof window === "undefined") return "dashboard";
  const h = window.location.hash.replace(/^#\/?/, "");
  return (ALL_VIEW_IDS as string[]).includes(h) ? (h as ViewId) : "dashboard";
}

export default function Home() {
  const [view, setView] = useState<ViewId>(viewFromHash);

  // The workspace is ready once the store holds analyses with regenerated
  // waveforms. Seeding/rehydration below only mutates the external Zustand
  // store; React re-renders via the subscription above — no local setState.
  const workspaceReady = useAnalysesStore(
    (s) => s.analyses.length > 0 && s.analyses.every((a) => !!a.waveform?.leads),
  );

  useEffect(() => {
    const store = useAnalysesStore.getState();
    store.ensureLibrary();
    store.rehydrateWaveforms();
    const next = useAnalysesStore.getState();
    if (!next.selectedId || !next.analyses.some((a) => a.id === next.selectedId)) {
      next.selectAnalysis(next.analyses[0]?.id ?? null);
    }
  }, []);

  // Deep links + browser back/forward: follow hash changes.
  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Mirror the active view into the URL (replaceState — no history spam).
  useEffect(() => {
    const target = view === "dashboard" ? "" : `#/${view}`;
    if (window.location.hash !== target) {
      history.replaceState(null, "", target || window.location.pathname);
    }
  }, [view]);

  const navigate = useCallback((v: ViewId) => setView(v), []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [view]);

  if (!workspaceReady) return <ShellSkeleton />;

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fb]">
      <Sidebar current={view} onNavigate={navigate} />
      <div className="flex min-h-screen flex-col lg:pl-64">
        <Header view={view} onNavigate={navigate} />
        <main className="print-full flex-1 px-4 py-6 sm:px-6 lg:px-8" id="main-content">
          <AnimatePresence mode="wait">
            <motion.div
              key={view}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {view === "dashboard" && <DashboardView onNavigate={navigate} />}
              {view === "upload" && <UploadView onNavigate={navigate} />}
              {view === "visualization" && <VisualizationView onNavigate={navigate} />}
              {view === "criteria" && <CriteriaView onNavigate={navigate} />}
              {view === "screening" && <ScreeningView onNavigate={navigate} />}
              {view === "comparison" && <ComparisonView />}
              {view === "reports" && <ReportsView onNavigate={navigate} />}
              {view === "research" && <ResearchView onNavigate={navigate} />}
            </motion.div>
          </AnimatePresence>
        </main>
        <Footer />
      </div>
    </div>
  );
}
