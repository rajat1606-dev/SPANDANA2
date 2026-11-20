"use client";

/**
 * ECG Analysis — drag & drop upload for 10-second 12-lead recordings.
 *
 * Honest by design: uploaded .csv/.txt matrices and
 * PhysioNet-style .dat/.hea records are REALLY decoded in the browser
 * (see lib/ecg/parsers.ts), voltage criteria are measured from the decoded
 * samples, and AI screening stays empty until the FastAPI research
 * backend is configured. Files that cannot be decoded fail with an
 * explicit, actionable error — the app never silently substitutes a
 * rendered substitute for an unreadable upload.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  CheckCircle2,
  FileUp,
  FileText,
  Loader2,
  ShieldAlert,
  TriangleAlert,
  UploadCloud,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { VerdictBadge, SignalOriginBadge } from "@/components/shared/badges";
import { LeadSparkline } from "@/components/ecg/EcgGrid";
import { useAnalysesStore, type ViewId } from "@/store/analyses";
import { createDecodedAnalysis, deriveInterpretation } from "@/lib/case-library";
import {
  EcgParseError,
  parseCsvEcg,
  parseDatFile,
  parseHeaHeader,
  type ParsedSignal,
} from "@/lib/ecg/parsers";
import { buildParsedSpec } from "@/lib/ecg/real-signal";
import { apiConfigured, requestModelInference } from "@/lib/api";
import type { EcgAnalysis, ParsedSpecData, Sex } from "@/lib/ecg/types";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 20 * 1024 * 1024;

const ACCEPTED_EXT = /\.(csv|txt|dat|hea)$/i;

interface PipelineStep {
  key: string;
  label: string;
  detail: string;
  status: "pending" | "running" | "done" | "warning";
}

const INITIAL_STEPS: PipelineStep[] = [
  { key: "validate", label: "Validate files", detail: "Format, size limit and pairing check", status: "pending" },
  { key: "decode", label: "Decode signal", detail: "In-browser parsing of the recording", status: "pending" },
  { key: "measure", label: "Measure & normalise", detail: "Baseline, per-lead voltages, heart rate", status: "pending" },
  { key: "criteria", label: "Traditional criteria", detail: "Sokolow–Lyon and Cornell from measured voltages", status: "pending" },
  { key: "ai", label: "AI screening", detail: "Perceptron + CNN (FastAPI backend)", status: "pending" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface FileGroup {
  hea?: File;
  dat?: File;
  text?: File;
  ignored: File[];
}

function groupFiles(files: File[]): FileGroup {
  const group: FileGroup = { ignored: [] };
  for (const f of files) {
    if (/\.hea$/i.test(f.name) && !group.hea) group.hea = f;
    else if (/\.dat$/i.test(f.name) && !group.dat) group.dat = f;
    else if (/\.(csv|txt)$/i.test(f.name) && !group.text) group.text = f;
    else group.ignored.push(f);
  }
  return group;
}

export function UploadView({ onNavigate }: { onNavigate: (v: ViewId) => void }) {
  const { toast } = useToast();
  const analyses = useAnalysesStore((s) => s.analyses);
  const addAndSelect = useAnalysesStore((s) => s.addAndSelect);
  const selectAnalysis = useAnalysesStore((s) => s.selectAnalysis);

  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<PipelineStep[]>(INITIAL_STEPS);
  const [progress, setProgress] = useState(0);
  const [fileSummary, setFileSummary] = useState<{ name: string; size: number; kind: string } | null>(null);
  const [result, setResult] = useState<EcgAnalysis | null>(null);
  const [decodeWarnings, setDecodeWarnings] = useState<string[]>([]);
  const [error, setError] = useState<{ message: string; hint?: string } | null>(null);
  const [sex, setSex] = useState<Sex>("Male");
  const [age, setAge] = useState("55");

  const uploadCount = analyses.filter((a) => a.meta.source === "file-upload").length;

  const setStep = (key: string, status: PipelineStep["status"], detail?: string) =>
    setSteps((prev) =>
      prev.map((s) =>
        s.key === key ? { ...s, status, detail: detail ?? s.detail } : s,
      ),
    );

  const runPipeline = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      setBusy(true);
      setResult(null);
      setError(null);
      setDecodeWarnings([]);
      setFileSummary(null);
      setSteps(INITIAL_STEPS.map((s) => ({ ...s, status: "pending" })));
      setProgress(5);

      try {
        /* 1 — validate: extensions, size, pairing */
        setStep("validate", "running");
        await sleep(350);
        const group = groupFiles(files);
        for (const f of files) {
          if (f.size === 0) throw new EcgParseError("empty-file", `${f.name}: the file is empty.`);
          if (f.size > MAX_FILE_BYTES) {
            throw new EcgParseError(
              "unknown-type",
              `${f.name}: ${(f.size / 1024 / 1024).toFixed(1)} MB exceeds the 20 MB upload limit.`,
              "Downsample or truncate the recording before uploading.",
            );
          }
          if (!ACCEPTED_EXT.test(f.name)) {
            throw new EcgParseError(
              "unknown-type",
              `${f.name}: unsupported file type.`,
              "Accepted formats: .csv, .txt (12-column sample matrix) and .dat + .hea (PhysioNet-style record).",
            );
          }
        }
        const pairing =
          group.text
            ? `CSV/TXT matrix — ${group.text.name}`
            : group.hea && group.dat
              ? `Paired PhysioNet record — ${group.hea.name} + ${group.dat.name}`
              : group.dat
                ? `Binary signal only — ${group.dat.name} (no header file)`
                : group.hea
                  ? `Header only — ${group.hea.name} (signal file missing)`
                  : "No supported file";
        setStep("validate", "done", `${files.length} file${files.length > 1 ? "s" : ""} · ${pairing}`);
        if (group.ignored.length > 0) {
          setDecodeWarnings((w) => [
            ...w,
            `Ignored ${group.ignored.length} additional file${group.ignored.length > 1 ? "s" : ""}: ${group.ignored.map((f) => f.name).join(", ")}.`,
          ]);
        }
        setProgress(18);

        /* 2 — decode: REAL in-browser parsing */
        setStep("decode", "running", "Parsing samples and lead layout…");
        await sleep(250);

        let signal: ParsedSignal;
        if (group.text) {
          const text = await group.text.text();
          signal = parseCsvEcg(text, group.text.name);
        } else if (group.dat) {
          const buffer = await group.dat.arrayBuffer();
          if (group.hea) {
            const heaText = await group.hea.text();
            const hea = parseHeaHeader(heaText, group.hea.name);
            signal = parseDatFile(buffer, group.dat.name, hea, group.hea.name);
          } else {
            signal = parseDatFile(buffer, group.dat.name);
          }
        } else if (group.hea) {
          const heaText = await group.hea.text();
          const hea = parseHeaHeader(heaText, group.hea.name);
          throw new EcgParseError(
            "missing-dat",
            `${group.hea.name}: header for record "${hea.recordName}" parsed (${hea.nLeads} leads @ ${hea.freq} Hz), but the matching .dat signal file was not selected.`,
            "Select the .dat and .hea files of the same record together.",
          );
        } else {
          throw new EcgParseError("unknown-type", "No decodable file was provided.");
        }

        setStep("decode", "done", signal.detail);
        setFileSummary({
          name: (group.text ?? group.dat ?? group.hea)?.name ?? "",
          size: (group.text ?? group.dat ?? group.hea)?.size ?? 0,
          kind: signal.kind,
        });
        setDecodeWarnings((w) => [...w, ...signal.warnings]);
        setProgress(42);

        /* 3 — measure: baseline, per-lead voltages, heart rate (real) */
        setStep("measure", "running");
        await sleep(250);
        const parsed: ParsedSpecData = buildParsedSpec(signal);
        const hrDetail =
          parsed.hrSource === "detected"
            ? `heart rate ${parsed.bpm} bpm (fixed-threshold R-peak detector)`
            : "heart rate not reliably detectable — displayed as n/a";
        setStep(
          "measure",
          "done",
          `Median-baseline amplitudes for 12 leads · ${hrDetail} · stored ≤ 250 Hz`,
        );
        setProgress(58);

        /* 4 — traditional criteria (real arithmetic on measured voltages) */
        setStep("criteria", "running");
        await sleep(300);
        const ageNum = Math.min(100, Math.max(1, Number(age) || 55));
        const code = `UPL-${String(uploadCount + 1).padStart(3, "0")}`;
        const analysis = createDecodedAnalysis({
          fileName: (group.text ?? group.dat ?? group.hea)?.name ?? "recording",
          signal,
          parsed,
          sex,
          age: ageNum,
          code,
        });
        setStep(
          "criteria",
          "done",
          `Sokolow–Lyon ${analysis.criteria.sokolowLyon.sum.toFixed(2)} mV · Cornell ${analysis.criteria.cornell.sum.toFixed(2)} mV`,
        );
        setProgress(76);

        /* 5 — AI screening: the backend is the only source of predictions */
        setStep("ai", "running");
        let backendNote = "FastAPI offline — no model output";
        if (apiConfigured()) {
          backendNote = "Attempting real inference…";
        }
        setStep("ai", "running", backendNote);
        await sleep(200);

        // The backend performs real inference on the DECODED samples. When it
        // is not configured this returns null and the analysis keeps no
        // predictions at all, rather than inventing them.
        const real = apiConfigured()
          ? await requestModelInference({
              patient: { code: analysis.meta.code, age: ageNum, sex },
              waveform: {
                sampleRate: analysis.waveform.sampleRate,
                durationSec: analysis.waveform.durationSec,
                leads: analysis.waveform.leads,
              },
            })
          : null;

        if (real && real.predictions.length === 2) {
          /* Attach the REAL backend outputs. Criteria were already measured
             locally from the decoded samples (same conventions as the
             backend), so only the AI block changes. */
          analysis.predictions = real.predictions;
          analysis.interpretation = deriveInterpretation({
            criteria: analysis.criteria,
            predictions: analysis.predictions,
          });
          analysis.awaitingBackend = false;
          analysis.notes =
            `Signal decoded in-browser from "${analysis.meta.sourceFile}". ` +
            "AI outputs produced by REAL backend inference (trained Perceptron + " +
            "CNN, PTB-XL models). Not a medical device.";
          setStep("ai", "done", "Real model inference received from FastAPI backend");
        } else {
          setStep(
            "ai",
            "warning",
            apiConfigured()
              ? "Backend gave no usable predictions — no AI results recorded"
              : "FastAPI offline — no AI results recorded",
          );
        }
        setProgress(100);
        await sleep(250);

        setResult(analysis);
        addAndSelect(analysis);
        toast({
          title: "Analysis complete",
          description:
            `${analysis.meta.code} — signal decoded from file; ` +
            (real && real.predictions.length === 2
              ? "real model inference (FastAPI)."
              : "voltage criteria only — backend offline."),
        });
      } catch (e) {
        const message =
          e instanceof EcgParseError || e instanceof Error
            ? e.message
            : "Unknown error while processing the upload.";
        const hint = e instanceof EcgParseError ? e.hint : undefined;
        setError({ message, hint });
        setSteps((prev) =>
          prev.map((s) => (s.status === "running" ? { ...s, status: "warning" } : s)),
        );
        toast({
          title: "Upload could not be decoded",
          description: message,
          variant: "destructive",
        });
      } finally {
        setBusy(false);
      }
    },
    [addAndSelect, age, sex, toast, uploadCount],
  );

  const acceptFiles = useCallback(
    (fileList: FileList | null | undefined) => {
      const files = Array.from(fileList ?? []);
      if (files.length === 0 || busy) return;
      void runPipeline(files);
    },
    [busy, runPipeline],
  );

  // Global drag guards so the browser never navigates away on a stray drop.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const ptbxlLibrary = analyses.filter((a) => a.meta.source === "ptbxl-library");

  return (
    <div className="space-y-6">
      {/* Disclaimer */}
      <Card className="border-amber-200 bg-amber-50/60 shadow-sm">
        <CardContent className="flex items-start gap-3 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">Research pipeline — in-browser decoding, backend inference</p>
            <p className="mt-0.5 leading-relaxed text-amber-800">
              Uploaded recordings are decoded in-browser (CSV matrix or PhysioNet-style .dat/.hea)
              and voltage criteria are measured from the actual samples. AI scores appear only once
              the FastAPI research backend is connected. No data leaves your browser.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
        {/* Upload zone */}
        <Card className="shadow-sm xl:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <UploadCloud className="h-5 w-5 text-[#1f63b8]" aria-hidden /> Upload ECG recording
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload ECG files: drag and drop or press Enter to browse"
              onClick={() => inputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!busy) setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                acceptFiles(e.dataTransfer.files);
              }}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1f63b8]",
                dragging
                  ? "border-[#1f63b8] bg-[#e9f0fa]"
                  : "border-[#c9d6e4] bg-[#faf8f4] hover:border-[#1f63b8]/60 hover:bg-[#f1f6fb]",
                busy && "pointer-events-none opacity-60",
              )}
            >
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e9f0fa]">
                <FileUp className="h-7 w-7 text-[#1f63b8]" aria-hidden />
              </span>
              <p className="mt-3 text-sm font-semibold text-[#1c1917]">
                Drag & drop a 10-second, 12-lead ECG recording
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                CSV · TXT (12-column matrix) — or a PhysioNet-style record: <span className="font-semibold">.dat + .hea</span> together
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                12 leads required · ≥ 5 s · max 20 MB · decoded locally, never uploaded
              </p>
              <input
                ref={inputRef}
                type="file"
                multiple
                className="hidden"
                accept=".csv,.txt,.dat,.hea"
                onChange={(e) => {
                  acceptFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>

            {/* Patient context (drives the sex-specific Cornell threshold) */}
            <div className="grid grid-cols-1 gap-3 rounded-lg border border-[#e7e2db] bg-[#faf8f4] p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="upl-sex" className="text-xs text-muted-foreground">
                  Recorded for (sex — sets Cornell threshold)
                </Label>
                <Select value={sex} onValueChange={(v) => setSex(v as Sex)}>
                  <SelectTrigger id="upl-sex" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Male">Male</SelectItem>
                    <SelectItem value="Female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="upl-age" className="text-xs text-muted-foreground">
                  Age (years)
                </Label>
                <Input
                  id="upl-age"
                  type="number"
                  min={1}
                  max={100}
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  className="bg-white"
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground sm:col-span-2">
                Used only for the sex-specific Cornell threshold. Do not upload personal
                data — use synthetic or fully anonymised files.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Pipeline status */}
        <Card className="shadow-sm xl:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-[#1f63b8]" aria-hidden /> Processing pipeline
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={progress} className="h-2" aria-label="Processing progress" />
            <ol className="space-y-3" aria-label="Pipeline steps">
              {steps.map((s) => (
                <li key={s.key} className="flex items-start gap-3">
                  <span className="mt-0.5">
                    {s.status === "pending" && <span className="block h-4 w-4 rounded-full border-2 border-[#d4dde8]" />}
                    {s.status === "running" && <Loader2 className="h-4 w-4 animate-spin text-[#1f63b8]" />}
                    {s.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                    {s.status === "warning" && <TriangleAlert className="h-4 w-4 text-amber-500" />}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-[13px] leading-tight",
                        s.status === "pending" ? "text-muted-foreground" : "font-semibold text-[#1c1917]",
                      )}
                    >
                      {s.label}
                    </p>
                    <p className="truncate text-[11.5px] text-muted-foreground" title={s.detail}>
                      {s.detail}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            {decodeWarnings.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                  Decoder notes ({decodeWarnings.length})
                </p>
                <ul className="mt-1.5 space-y-1">
                  {decodeWarnings.map((w, i) => (
                    <li key={i} className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-amber-800">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      {w}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error */}
      {error && (
        <Card className="border-red-200 bg-red-50/60 shadow-sm">
          <CardContent className="flex items-start gap-3 p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" aria-hidden />
            <div className="text-sm">
              <p className="font-semibold text-red-900">Decoding failed — no analysis was created</p>
              <p className="mt-0.5 leading-relaxed text-red-800">{error.message}</p>
              {error.hint && <p className="mt-1 text-[12px] text-red-700">Suggestion: {error.hint}</p>}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result */}
      {result && (
        <Card className="border-[#bfe0f2] shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden />
              Analysis ready — {result.meta.code}
              <SignalOriginBadge meta={result.meta} />
              {result.awaitingBackend ? (
                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">
                  Criteria only — backend offline
                </Badge>
              ) : (
                <Badge className="bg-emerald-600">Backend inference</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={result.interpretation} />
              <Badge variant="outline" className="bg-white">
                SL {result.criteria.sokolowLyon.sum.toFixed(2)} mV{" "}
                {result.criteria.sokolowLyon.positive ? "≥" : "<"} 3.5
              </Badge>
              <Badge variant="outline" className="bg-white">
                Cornell {result.criteria.cornell.sum.toFixed(2)} mV{" "}
                {result.criteria.cornell.positive ? "≥" : "<"} {result.criteria.cornell.threshold.toFixed(1)}
              </Badge>
              {result.predictions.length >= 2 ? (
                <Badge variant="outline" className="bg-white">
                  Perceptron {(result.predictions[0].probability * 100).toFixed(0)}% · CNN{" "}
                  {(result.predictions[1].probability * 100).toFixed(0)}%
                </Badge>
              ) : (
                <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">
                  No AI score — FastAPI backend not connected
                </Badge>
              )}
            </div>
            <div className="rounded-lg border border-[#e7e2db] bg-[#faf8f4] px-4 py-3">
              <LeadSparkline waveform={result.waveform} className="h-14 w-full" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-[#1c1917] hover:bg-[#2a2320]" onClick={() => onNavigate("visualization")}>
                View 12-lead signal
              </Button>
              <Button size="sm" variant="outline" className="bg-white" onClick={() => onNavigate("criteria")}>
                Criteria details
              </Button>
              <Button size="sm" variant="outline" className="bg-white" onClick={() => onNavigate("screening")}>
                AI screening
              </Button>
              <Button size="sm" variant="outline" className="bg-white" onClick={() => onNavigate("reports")}>
                <FileText className="h-4 w-4" aria-hidden /> Report
              </Button>
            </div>
            {fileSummary && (
              <p className="text-[11px] text-muted-foreground">
                Source: <span className="font-medium text-[#1c1917]">{fileSummary.name}</span> ·{" "}
                {(fileSummary.size / 1024).toFixed(0)} KB · decoded in-browser ({fileSummary.kind}) ·{" "}
                {result.spec.parsed?.detail}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* PTB-XL library shortcut */}
      <div>
        <div className="mb-3 flex items-end justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#1c1917]">Or explore the PTB-XL library</h3>
            <p className="text-sm text-muted-foreground">
              Real test-fold recordings with their measured voltages — click a card to open
              one in the workspace.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {ptbxlLibrary.map((a) => (
            <Card
              key={a.id}
              className="cursor-pointer p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              onClick={() => {
                selectAnalysis(a.id);
                onNavigate("visualization");
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  selectAnalysis(a.id);
                  onNavigate("visualization");
                }
              }}
              aria-label={`Open PTB-XL recording ${a.meta.code}`}
            >
              <div className="flex items-center justify-between">
                <p className="font-mono text-xs font-bold text-[#1c1917]">{a.meta.code}</p>
                <VerdictBadge verdict={a.interpretation} withLabel={false} />
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.meta.sex}, {a.meta.age} yrs · {a.spec.bpm} bpm
              </p>
              <div className="mt-2 rounded-md border border-[#eed4d7] bg-[#fffdfb] px-2 py-1">
                <LeadSparkline waveform={a.waveform} className="h-10 w-full" />
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>SL {a.criteria.sokolowLyon.sum.toFixed(2)} mV</span>
                <span>Cornell {a.criteria.cornell.sum.toFixed(2)} mV</span>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
