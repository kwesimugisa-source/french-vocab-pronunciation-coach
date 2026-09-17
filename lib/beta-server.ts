// SERVER ONLY: never imported by a client component. No public inspection route.
import { betaJournal, BetaData } from "./beta-events";
import { RATE_MESSAGE } from "./safe-errors";
export { RATE_MESSAGE } from "./safe-errors";
export class RequestGate {
  private window = 0;
  private total = 0;
  private active = 0;
  private clients = new Map<string, { count: number; active: Set<string> }>();
  constructor(private now = Date.now, private limit = 120, private concurrency = 8) {}
  acquire(session: string | null, operation: string): (() => void) | null {
    if (this.now()-this.window >= 60_000) { this.window=this.now(); this.total=0; for (const [id,c] of this.clients) { c.count=0; if (!c.active.size) this.clients.delete(id); } }
    const id = session && /^[0-9a-f-]{36}$/i.test(session) ? session : null;
    const c = id ? this.clients.get(id) ?? {count:0, active:new Set<string>()} : null;
    if (this.total >= this.limit || this.active >= this.concurrency || (c && (c.count >= 30 || c.active.has(operation)))) return null;
    this.total++; this.active++;
    if (c && id) { c.count++; c.active.add(operation); this.clients.set(id,c); }
    let released = false;
    return () => { if (!released) { released=true; this.active--; c?.active.delete(operation); } };
  }
}
const gate = new RequestGate();
let reportedAt=0;
/** Private process inspection / owner-controlled deployment logs only. No HTTP route. */
export function serverDiagnostics() { return betaJournal.aggregate(); }
export function protectedRoute(operation: NonNullable<BetaData["operation"]>, handler: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    // Same-origin browser requests only; no IP identity or fingerprinting.
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) return Response.json({ code:"INVALID_INPUT", error:"Demande non autorisée." }, {status:403});
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > (operation === "pronunciation" ? 10_000_000 : 500_000)) return Response.json({code:"INVALID_INPUT",error:"Demande trop volumineuse."},{status:413});
    const release = gate.acquire(req.headers.get("x-beta-session"), operation);
    if (!release) { betaJournal.emit({name:"rate_limit",operation,status:"failed",code:"RATE_LIMITED"}); return Response.json({code:"RATE_LIMITED",error:RATE_MESSAGE},{status:429,headers:{"Retry-After":"60"}}); }
    try {
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
      const response=await handler(new Request(req.url,{method:req.method,headers:req.headers,body,signal:req.signal}));
      if(!response.ok) betaJournal.emit({name:"operation",operation,status:"failed",code:response.status<500?"INVALID_INPUT":"PROVIDER_FAILED"});
      return response;
    }
    catch { betaJournal.emit({name:"operation",operation,status:"failed",code:"PROVIDER_FAILED"}); return Response.json({code:"PROVIDER_FAILED",error:"Service momentanément indisponible. Réessayez."},{status:500}); }
    finally {
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
