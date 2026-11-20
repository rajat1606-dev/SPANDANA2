/**
 * FastAPI integration layer (forward-ready).
 *
 * SPANDANA ships as a research frontend. When the Python FastAPI backend
 * becomes available, set NEXT_PUBLIC_FASTAPI_URL (e.g. http://localhost:8000)
 * and the app will serve real model inference. Without it the app shows
 * voltage criteria only. Expected contract (all responses JSON):
 *
 *   GET  {base}/health
 *        → { status: "ok", models: ["perceptron", "cnn"], version: "1.0" }
 *
 *   POST {base}/api/v1/screen
 *        body: {
 *          patient: { code, age, sex },
 *          signal: { sampleRate, durationSec, leads: { I: number[], ... } }
 *        }
 *        → {
 *          predictions: [
 *            { model: "perceptron", probability: 0.0-1.0, latencyMs },
 *            { model: "cnn", probability: 0.0-1.0, latencyMs }
 *          ]
 *        }
 *
 *   GET  {base}/api/v1/models/metrics
 *        → { metrics: [ { model, accuracy, precision, sensitivity,
 *                         specificity, f1, rocAuc } ] }
 *
 * Until a successful /health response is observed the UI shows voltage
 * criteria only and states that model output is unavailable.
 */

import type { EcgWaveform, ModelPrediction, PatientMeta } from "@/lib/ecg/types";

const BUILD_TIME_BASE = (process.env.NEXT_PUBLIC_FASTAPI_URL ?? "").replace(
  /\/$/,
  "",
);

/**
 * Where a runtime override is remembered. A deployed build is compiled once
 * with whatever NEXT_PUBLIC_FASTAPI_URL held at build time, but a backend
 * reached through a tunnel gets a fresh hostname every restart. Rebuilding
 * the site for each one is not sensible, so the base can also be handed to
 * the page as ?api=<url> and is then remembered in this key.
 */
const OVERRIDE_KEY = "spandana-api-base";

function readOverride(): string {
  if (typeof window === "undefined") return "";
  try {
    const fromQuery = new URLSearchParams(window.location.search).get("api");
    if (fromQuery !== null) {
      const cleaned = fromQuery.trim().replace(/\/$/, "");
      // An empty ?api= clears the override and falls back to the build value.
      if (cleaned === "") window.localStorage.removeItem(OVERRIDE_KEY);
      else window.localStorage.setItem(OVERRIDE_KEY, cleaned);
      return cleaned;
    }
    return window.localStorage.getItem(OVERRIDE_KEY) ?? "";
  } catch {
    // Private mode or blocked storage: fall back to the build-time value.
    return "";
  }
}

/** The base every request below is sent to. Resolved per call, not once. */
export function apiBase(): string {
  return readOverride() || BUILD_TIME_BASE;
}

export const apiConfigured = () => apiBase().length > 0;

export interface BackendStatus {
  configured: boolean;
  reachable: boolean;
  models?: string[];
  version?: string;
  checkedAt?: string;
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Ping the FastAPI backend. Never throws — returns a status object. */
export async function checkBackendHealth(
  timeoutMs = 2500,
): Promise<BackendStatus> {
  if (!apiConfigured()) {
    return { configured: false, reachable: false };
  }
  try {
    const res = await fetchWithTimeout(
      `${apiBase()}/health`,
      { method: "GET" },
      timeoutMs,
    );
    if (!res.ok) return { configured: true, reachable: false };
    const data = (await res.json()) as {
      status?: string;
      models?: string[];
      version?: string;
    };
    return {
      configured: true,
      reachable: data.status === "ok",
      models: data.models,
      version: data.version,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return { configured: true, reachable: false };
  }
}

export interface ScreenRequest {
  patient: Pick<PatientMeta, "code" | "age" | "sex">;
  waveform: Pick<EcgWaveform, "sampleRate" | "durationSec"> & {
    leads: EcgWaveform["leads"];
  };
}

export interface ScreenResponse {
  predictions: ModelPrediction[];
  /** Real voltage-criterion values computed server-side (optional). */
  criteria?: {
    sokolowLyon: { sum: number; threshold: number; positive: boolean; reference: string };
    cornell: { sum: number; threshold: number; positive: boolean; reference: string };
    agreement: "both-positive" | "both-negative" | "discordant";
    features: Record<string, number>;
  };
  meta?: Record<string, unknown>;
}

/**
 * Request real inference from the FastAPI backend.
 * Returns null when the backend is not reachable; callers then leave the
 * analysis without predictions rather than inventing them.
 */
export async function requestModelInference(
  req: ScreenRequest,
  timeoutMs = 8000,
): Promise<ScreenResponse | null> {
  if (!apiConfigured()) return null;
  try {
    const res = await fetchWithTimeout(
      `${apiBase()}/api/v1/screen`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(req),
      },
      timeoutMs,
    );
    if (!res.ok) return null;
    const data = (await res.json()) as ScreenResponse;
    return data;
  } catch {
    return null;
  }
}

export interface BackendModelMetric {
  model: string;
  family?: "criterion" | "ml";
  accuracy: number;
  precision: number;
  sensitivity: number;
  specificity: number;
  f1: number;
  rocAuc: number;
  /** Added by the research evaluation pipeline when available. */
  prAuc?: number;
  threshold?: number;
}

export interface MetricsResponse {
  metrics: BackendModelMetric[];
  meta?: {
    generated?: string;
    dataset?: string;
    test_split?: string;
    validation_split?: string;
    label_policy?: string;
    roc_pr_curves?: Record<
      string,
      { roc: { fpr: number[]; tpr: number[] }; pr: { recall: number[]; precision: number[] } }
    >;
  };
}

/**
 * Fetch real validation metrics from the FastAPI backend (module 6).
 * Returns null when the backend is not configured/reachable so callers can
 * fall back to the measured metrics bundled in lib/real-data.ts.
 */
export async function fetchModelMetrics(
  timeoutMs = 5000,
): Promise<MetricsResponse | null> {
  if (!apiConfigured()) return null;
  try {
    const res = await fetchWithTimeout(
      `${apiBase()}/api/v1/models/metrics`,
      { method: "GET" },
      timeoutMs,
    );
    if (!res.ok) return null;
    return (await res.json()) as MetricsResponse;
  } catch {
    return null;
  }
}
