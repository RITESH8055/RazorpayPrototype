import type { ReadResult } from "./types";
import { looksLikeInstructions, parseExtraction } from "../logic/extraction";
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

/** Calls the proxy. No key, timeout, invalid JSON or schema errors load the scripted fallback. */
export async function readReply(scenarioId: string, sub: Submission): Promise<ReadResult> {
  const started = performance.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
  const injected = looksLikeInstructions(sub.text);
  let fallbackReason: string;
  try {
    let file: { media_type: string; data: string } | undefined;
    if (sub.fileDataUrl) {
      const m = /^data:([^;]+);base64,(.*)$/.exec(sub.fileDataUrl);
      if (m) file = { media_type: m[1], data: m[2] };
    }
    const res = await fetch("/api/read-reply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ scenario_id: scenarioId, file, text: file ? undefined : sub.text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message ?? `Proxy returned ${res.status}`);
    const extraction = parseExtraction(body.extraction);
    return { source: "live", latencyMs: Math.round(performance.now() - started), extraction, injectionDetected: extraction.document_contains_instructions || injected };
  } catch (err) {
    fallbackReason = err instanceof DOMException && err.name === "AbortError" ? "Timed out" : err instanceof Error ? err.message : "Unknown error";
  } finally {
    clearTimeout(timer);
  }
  const extraction = parseExtraction(structuredClone(FALLBACK[scenarioId]));
  return { source: "fallback", fallbackReason, latencyMs: Math.round(performance.now() - started), extraction, injectionDetected: extraction.document_contains_instructions || injected };
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
