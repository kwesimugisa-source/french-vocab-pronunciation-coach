import { betaJournal, BetaData } from "./beta-events";
export type PreparationState = { requestId: string; documentId?: string; revision?: number; operation: NonNullable<BetaData["operation"]>; startedAt: number };
export class Preparation {
  private snapshot: PreparationState | null = null;
  private context: Partial<BetaData> = {};
  private listeners = new Set<() => void>();
  constructor(private journal = betaJournal, private now = Date.now) {}
  getSnapshot = () => this.snapshot;
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  private notify() { this.listeners.forEach(fn => fn()); }
  begin(operation: PreparationState["operation"], context: Partial<BetaData> = {}) {
    this.cancel(); this.context = { ...context };
    this.snapshot = { requestId: crypto.randomUUID(), documentId: context.documentId, revision: context.revision, operation, startedAt: this.now() };
    this.journal.emit({ ...this.context, name: "operation", operation, operationId: this.snapshot.requestId, status: "started" });
    this.notify(); return this.snapshot.requestId;
  }
  finish(requestId: string, status: "completed" | "failed" | "cancelled", code?: BetaData["code"]) {
    if (this.snapshot?.requestId !== requestId) return;
    this.journal.emit({ ...this.context, name: "operation", operation: this.snapshot.operation, operationId: requestId, status,
      durationMs: Math.max(0, Math.round(this.now()-this.snapshot.startedAt)), ...(code ? {code} : {}) });
    this.snapshot = null; this.notify();
  }
  cancel() { if (this.snapshot) this.finish(this.snapshot.requestId, "cancelled"); }
}
