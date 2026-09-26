// Server-only functional cache. Never telemetry, a public lookup route, or durable storage.
import { createHash, randomUUID } from "node:crypto";
import type { DramaticAnalysis } from "./theatre-direction";

export class TheatreAnalysisCache {
  private entries = new Map<string, { digest: string; analysis: DramaticAnalysis; expires: number }>();
  constructor(private now = Date.now, private capacity = 16) {}
  private prune() {
    for (const [key, entry] of this.entries) if (entry.expires <= this.now()) this.entries.delete(key);
  }
  get(reference: unknown, source: string, scope = ""): DramaticAnalysis | undefined {
    this.prune();
    if (typeof reference !== "string") return undefined;
    const entry = this.entries.get(reference);
    return entry?.digest === createHash("sha256").update(JSON.stringify([scope, source])).digest("hex") ? structuredClone(entry.analysis) : undefined;
  }
  put(source: string, analysis: DramaticAnalysis, scope = ""): string {
    this.prune();
    while (this.entries.size >= this.capacity) this.entries.delete(this.entries.keys().next().value!);
    const reference = randomUUID();
    this.entries.set(reference, { digest: createHash("sha256").update(JSON.stringify([scope, source])).digest("hex"), analysis: structuredClone(analysis), expires: this.now() + 30 * 60_000 });
    return reference;
  }
  clear() { this.entries.clear(); }
}
export const theatreAnalysisCache = new TheatreAnalysisCache();
