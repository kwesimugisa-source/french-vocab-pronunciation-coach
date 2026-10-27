/** Opaque in-memory continuation transport. Not diagnostics or audio authority. */
export type TheatreContinuation = { token: string; productionId: string; preparationId: string; epoch: number };
export function theatreContinuation(value: unknown): TheatreContinuation | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (Object.keys(v).sort().join() !== "epoch,preparationId,productionId,token" ||
      typeof v.token !== "string" || !/^preparation-v1\.[A-Za-z0-9_-]+$/.test(v.token) || v.token.length > 450_000 ||
      typeof v.productionId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(v.productionId) ||
      typeof v.preparationId !== "string" || !/^[0-9a-f-]{36}$/i.test(v.preparationId) ||
      !Number.isSafeInteger(v.epoch) || (v.epoch as number) < 1 || (v.epoch as number) > 10000) return null;
  return { token:v.token,productionId:v.productionId,preparationId:v.preparationId,epoch:v.epoch as number };
}
