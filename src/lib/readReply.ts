import type { ReadResult } from "./types";
import type { Extraction } from "./types";
import { looksLikeInstructions, parseExtraction } from "../shared/extraction";
import { basicParse } from "../shared/basicParser";
import fa from "../data/fallback/read-reply-a.json";
import fb from "../data/fallback/read-reply-b.json";
import fc from "../data/fallback/read-reply-c.json";

const FALLBACK = { a: fa, b: fb, c: fc } as Record<string, unknown>;
const CLIENT_TIMEOUT_MS = 8500; // the proxy times out at 8s; this is a safety net

export interface Submission {
  kind: "invoice" | "text" | "confirm";
  text: string;
  /** data: URL of an uploaded image or PDF, if any */
  fileDataUrl?: string;
  fileName?: string;
  sample: boolean;
}

/** The pre-written reading of a scenario's original reply. */
export function scriptedExtraction(scenarioId: string): Extraction {
  return parseExtraction(structuredClone(FALLBACK[scenarioId]));
}

async function callProxy(scenarioId: string, file: { media_type: string; data: string } | undefined, text: string | undefined): Promise<Extraction> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch("/api/read-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ scenario_id: scenarioId, file, text: file ? undefined : text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message ?? `Proxy returned ${res.status}`);
    return parseExtraction(body.extraction);
  } finally {
    clearTimeout(timer);
  }
}

const reason = (err: unknown) => (err instanceof DOMException && err.name === "AbortError" ? "Timed out" : err instanceof Error ? err.message : "Unknown error");

/** Calls the proxy. No key, timeout, invalid JSON or schema errors load the scripted fallback. */
export async function readReply(scenarioId: string, sub: Submission): Promise<ReadResult> {
  const started = performance.now();
  const injected = looksLikeInstructions(sub.text);
  let file: { media_type: string; data: string } | undefined;
  const m = sub.fileDataUrl ? /^data:([^;]+);base64,(.*)$/.exec(sub.fileDataUrl) : null;
  if (m) file = { media_type: m[1], data: m[2] };
  try {
    const extraction = await callProxy(scenarioId, file, sub.text);
    return { source: "live", latencyMs: Math.round(performance.now() - started), extraction, injectionDetected: extraction.document_contains_instructions || injected };
  } catch (err) {
    const extraction = parseExtraction(structuredClone(FALLBACK[scenarioId]));
    return { source: "fallback", fallbackKind: "scripted", fallbackReason: reason(err), latencyMs: Math.round(performance.now() - started), extraction, injectionDetected: extraction.document_contains_instructions || injected };
  }
}

/** Edited text ("Try to fool it"): live reading, else the basic local parser on the same text. */
export async function readText(scenarioId: string, text: string): Promise<ReadResult> {
  const started = performance.now();
  const injected = looksLikeInstructions(text);
  try {
    const extraction = await callProxy(scenarioId, undefined, text);
    return { source: "live", latencyMs: Math.round(performance.now() - started), extraction, injectionDetected: extraction.document_contains_instructions || injected };
  } catch (err) {
    const extraction = basicParse(text);
    return { source: "fallback", fallbackKind: "basic", fallbackReason: reason(err), latencyMs: Math.round(performance.now() - started), extraction, injectionDetected: extraction.document_contains_instructions || injected };
  }
}

export async function urlToDataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}
