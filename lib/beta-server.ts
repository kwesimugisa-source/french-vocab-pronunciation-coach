// SERVER ONLY: never imported by a client component. No public inspection route.
import { betaJournal, BetaData } from "./beta-events";
import { isPreparationId, validatePreparationRecord, copyPreparationRecord, PREPARATION_CONFIGURATION } from "./beta-events";
import type { PreparationRecord, PreparationStage, PreparationReason, PreparationObserver, PreparationMetadata } from "./beta-events";
import { RATE_MESSAGE } from "./safe-errors";
export { RATE_MESSAGE } from "./safe-errors";
export class RequestGate {
  private window = 0;
  private total = 0;
  private active = 0;
  private clients = new Map<string, { count: number; active: Map<string, number> }>();
  constructor(private now = Date.now, private limit = 120, private concurrency = 8, private clientLimit = 30, private operationConcurrency = 1) {}
  acquire(session: string | null, operation: string): (() => void) | null {
    if (this.now()-this.window >= 60_000) { this.window=this.now(); this.total=0; for (const [id,c] of this.clients) { c.count=0; if (!c.active.size) this.clients.delete(id); } }
    const id = session && /^[0-9a-f-]{36}$/i.test(session) ? session : null;
    const c = id ? this.clients.get(id) ?? {count:0, active:new Map<string, number>()} : null;
    if (this.total >= this.limit || this.active >= this.concurrency || (c && (c.count >= this.clientLimit || (c.active.get(operation) ?? 0) >= this.operationConcurrency))) return null;
    this.total++; this.active++;
    if (c && id) { c.count++; c.active.set(operation,(c.active.get(operation) ?? 0)+1); this.clients.set(id,c); }
    let released = false;
    return () => { if (!released) { released=true; this.active--; if(c) { const remaining=(c.active.get(operation) ?? 1)-1; if(remaining) c.active.set(operation,remaining); else c.active.delete(operation); } } };
  }
}
const gate = new RequestGate();
let reportedAt=0;
/** Private process inspection / owner-controlled deployment logs only. No HTTP route. */
export function serverDiagnostics() { return betaJournal.aggregate(); }
/** Per-invocation extension of the beta journal. No content or body is accepted. */
export class TheatrePreparationRecorder {
  private active = false;
  private count = 0;
  private terminal: PreparationRecord | null = null;
  private stage: PreparationStage = "request";
  private failure: {stage: PreparationStage; reason: PreparationReason} | null = null;
  private clarification = false;
  private lateRecorded = false;
  private readonly born: number;
  private starts = new Map<PreparationStage,number>();
  private metadata:PreparationMetadata = {};
  readonly requestId: string;
  private readonly build: string;
  constructor(requestId: unknown, private sink = (record: PreparationRecord) => console.info("beta_theatre_preparation", JSON.stringify(record)), private now=Date.now) {
    this.born = now();
    this.requestId = isPreparationId(requestId) ? requestId : crypto.randomUUID();
    const build = process.env.VERCEL_GIT_COMMIT_SHA;
    this.build = build?.length === 40 && /^[0-9a-f]{40}$/.test(build) ? build : "unknown";
  }
  activate() { if(!this.active && !this.terminal) { this.active = true; this.observe("request", "started"); } }
  private emit(record: PreparationRecord) {
    try { validatePreparationRecord(record); betaJournal.recordPreparation(record); this.sink(copyPreparationRecord(record)); } catch { /* Logging must never fail preparation. */ }
  }
  private timing(stage:PreparationStage) {
    const timestamp=this.now(), bounded=(n:number)=>Math.max(0,Math.min(3_600_000,Math.round(n)));
    return {timestamp,elapsedMs:bounded(timestamp-(this.starts.get(stage)??timestamp)),totalElapsedMs:bounded(timestamp-this.born)};
  }
  observe: PreparationObserver = (stage, outcome, reason = "none", metadata = {}) => {
    if(!this.active) return;
    if(this.terminal) {
      // One bounded, nonterminal indication that a provider settled too late.
      if(!this.lateRecorded && ["CANCELLED","TECHNICAL_HOLD"].includes(this.terminal.disposition!) && stage==="provider" && ["passed","rejected"].includes(outcome)) {
        this.lateRecorded=true;
        this.emit({...PREPARATION_CONFIGURATION,...this.timing(stage),build:this.build,requestId:this.requestId,stage,outcome:"ignored",reason:"late_result_ignored",retryable:false});
      }
      return;
    }
    if(!metadata || typeof metadata!=="object" || Array.isArray(metadata) || Object.keys(metadata).some(k=>k!=="counts"&&k!=="authorityRevision")) return;
    const record = {...PREPARATION_CONFIGURATION,...this.timing(stage),build:this.build,requestId:this.requestId,stage,outcome,reason,retryable:false,...metadata};
    try { validatePreparationRecord(record); } catch { return; }
    if(outcome==="started") { this.starts.set(stage,this.now()); record.elapsedMs=0; }
    this.stage = stage;
    if(outcome === "rejected" && !this.failure) this.failure = {stage,reason};
    if(stage === "authority" && outcome === "passed") this.clarification = reason === "linguistic_ambiguity";
    this.metadata={...this.metadata,...metadata,...(metadata.counts?{counts:{...this.metadata.counts,...metadata.counts}}:{})};
    // Reserve a terminal and one possible ignored late result: 64 records total.
    if(this.count++ < 62) this.emit(record);
  };
  finish(status: number, cancellation?: "cancelled" | "timeout") {
    if(!this.active) return null;
    if(this.terminal) return copyPreparationRecord(this.terminal);
    const failed = status >= 400;
    const stage = cancellation ? this.stage : failed ? this.failure?.stage ?? this.stage : "response";
    const reason = cancellation ?? (failed ? this.failure?.reason ?? (status === 429 ? "rate_limited" : status < 500 ? "invalid_request" : "preparation_failed") : this.clarification ? "linguistic_ambiguity" : "none");
    const disposition=cancellation === "cancelled" ? "CANCELLED" : failed ? "TECHNICAL_HOLD" : this.clarification ? "CLARIFICATION_REQUIRED" : "READY";
    this.terminal = {...PREPARATION_CONFIGURATION,...this.timing(stage),...this.metadata,build:this.build,requestId:this.requestId,stage,disposition,
      outcome:cancellation === "cancelled" ? "cancelled" : failed ? "failed" : this.clarification ? "clarification" : "succeeded",
      reason,retryable:!!cancellation || status === 429 || status >= 500};
    this.emit(this.terminal);
    return copyPreparationRecord(this.terminal);
  }
  response(response: Response, cancellation?: "cancelled" | "timeout") {
    const receipt = this.finish(response.status, cancellation);
    if(!receipt) return response;
    const headers = new Headers(response.headers);
    headers.set("X-Theatre-Request-Id",this.requestId);
    headers.set("X-Theatre-Preparation-Receipt",JSON.stringify(receipt));
    return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  }
}
export function protectedRoute(operation: NonNullable<BetaData["operation"]>, handler: (req: Request, diagnostic?: TheatrePreparationRecorder) => Promise<Response>, options: { gate?: RequestGate; deadlineMs?: number; theatrePreparation?: boolean } = {}) {
  return async (req: Request): Promise<Response> => {
    const diagnostic = options.theatrePreparation ? new TheatrePreparationRecorder(req.headers.get("X-Theatre-Request-Id")) : undefined;
    if(req.headers.get("X-Theatre-Preparation") === "1") diagnostic?.activate();
    const respond = (response: Response, cancellation?: "cancelled" | "timeout") => diagnostic?.response(response,cancellation) ?? response;
    // Same-origin browser requests only; no IP identity or fingerprinting.
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) return respond(Response.json({ code:"INVALID_INPUT", error:"Demande non autorisée." }, {status:403}));
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > (operation === "pronunciation" ? 10_000_000 : 500_000)) return respond(Response.json({code:"INVALID_INPUT",error:"Demande trop volumineuse."},{status:413}));
    const release = (options.gate ?? gate).acquire(req.headers.get("x-beta-session"), operation);
    if (!release) { betaJournal.emit({name:"rate_limit",operation,status:"failed",code:"RATE_LIMITED"}); return respond(Response.json({code:"RATE_LIMITED",error:RATE_MESSAGE},{status:429,headers:{"Retry-After":"60"}})); }
    const controller = new AbortController();
    const abort = () => controller.abort();
    req.signal.addEventListener("abort", abort, {once:true});
    if(req.signal.aborted) abort();
    let timedOut = false;
    const timer = options.deadlineMs ? setTimeout(() => { timedOut = true; abort(); }, options.deadlineMs) : undefined;
    let abortListener: () => void = () => {};
    const cancelled = new Promise<Response>(resolve => {
      abortListener = () => { release(); resolve(respond(Response.json({code:"PREPARATION_ABORTED",error:"Préparation interrompue. Réessayez cet élément."},{status:408}),timedOut ? "timeout" : "cancelled")); };
      controller.signal.addEventListener("abort",abortListener,{once:true});
      if(controller.signal.aborted) abortListener();
    });
    const run = async () => {
      controller.signal.throwIfAborted();
      // Enforce the actual body size too, including chunked requests without a
      // Content-Length. Bound memory before JSON/form parsing or provider work.
      const reader=req.body?.getReader(), chunks: Uint8Array[]=[];
      let size=0;
      if (reader) for (;;) {
        const part=await reader.read(); if(part.done) break;
        size+=part.value.byteLength;
        if(size>(operation==="pronunciation"?10_000_000:500_000)) { await reader.cancel(); return Response.json({code:"INVALID_INPUT",error:"Demande trop volumineuse."},{status:413}); }
        chunks.push(part.value);
      }
      const body=new Uint8Array(size); let offset=0; for(const chunk of chunks) {body.set(chunk,offset);offset+=chunk.length;}
      // Recognize explicit Theatre clients even if they omit the diagnostic hint.
      // Never retain or log this body (the existing handler still validates it).
      if(diagnostic) { try { if(JSON.parse(new TextDecoder().decode(body))?.contentType === "theatre") diagnostic.activate(); } catch { /* Handler owns invalid JSON. */ } }
      const response=await handler(new Request(req.url,{method:req.method,headers:req.headers,body,signal:controller.signal}),diagnostic);
      if(!response.ok) betaJournal.emit({name:"operation",operation,status:"failed",code:response.status<500?"INVALID_INPUT":"PROVIDER_FAILED"});
      return response;
    };
    try { return respond(await (controller.signal.aborted ? cancelled : Promise.race([run(),cancelled]))); }
    catch { betaJournal.emit({name:"operation",operation,status:"failed",code:"PROVIDER_FAILED"}); return respond(Response.json({code:"PROVIDER_FAILED",error:"Service momentanément indisponible. Réessayez."},{status:500})); }
    finally {
      clearTimeout(timer); req.signal.removeEventListener("abort",abort); controller.signal.removeEventListener("abort",abortListener);
      controller.abort();
      release();
      if(process.env.NODE_ENV==="production" && Date.now()-reportedAt>=60_000) {
        reportedAt=Date.now();
        try { console.info("beta_aggregate",serverDiagnostics()); } catch { /* Diagnostics cannot interrupt learning. */ }
      }
    }
  };
}
/** Counts SDK invocations, not invisible HTTP retries. Never captures arguments,
 * output_text, transcript, provider errors or recordings. No invented prices. */
export { providerCall } from "./beta-provider";
