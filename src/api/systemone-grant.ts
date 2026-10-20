/** Legacy compatibility only. Platform grants are retired by full BYOK. */
export interface SystemOneGrant { apiKey: string; expiresAtMs?: number; available: boolean }
export function getCachedSystemOneGrant(): SystemOneGrant | null { return null; }
export async function requestSystemOneGrant(): Promise<SystemOneGrant | null> { return null; }
export function clearSystemOneGrantCache(): void { /* no shared credentials are cached */ }
