import { betaJournal, BetaData } from "./beta-events";
/** Aggregate SDK invocations only, not hidden transport retries. No content. */
export async function providerCall<T>(operation: NonNullable<BetaData["operation"]>, call: () => PromiseLike<T>, ttsCharacters?: number): Promise<T> {
  betaJournal.emit({name:"provider",operation,status:"started",requests:1,...(ttsCharacters !== undefined ? {ttsCharacters} : {})});
  try {
    const result = await call();
    const usage = (result as {usage?: {input_tokens?: unknown; output_tokens?: unknown}} | null)?.usage;
    const counts: Partial<BetaData> = {};
    if (Number.isSafeInteger(usage?.input_tokens) && Number(usage?.input_tokens) >= 0) counts.inputTokens = Number(usage!.input_tokens);
    if (Number.isSafeInteger(usage?.output_tokens) && Number(usage?.output_tokens) >= 0) counts.outputTokens = Number(usage!.output_tokens);
    betaJournal.emit({name:"provider",operation,status:"completed",...counts}); return result;
  } catch (error) { betaJournal.emit({name:"provider",operation,status:"failed",code:"PROVIDER_FAILED"}); throw error; }
}
