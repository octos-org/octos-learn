import { request } from "./client";

export interface SystemOneGrant {
  apiKey: string;
  expiresAtMs?: number;
  available: boolean;
}

let inMemoryGrant: { grant: SystemOneGrant; fetchedAt: number } | null = null;

export function getCachedSystemOneGrant(): SystemOneGrant | null {
  if (inMemoryGrant) {
    const now = Date.now();
    if (!inMemoryGrant.grant.expiresAtMs || inMemoryGrant.grant.expiresAtMs > now + 30_000) {
      return inMemoryGrant.grant;
    }
  }
  return null;
}

export async function requestSystemOneGrant(): Promise<SystemOneGrant | null> {
  // If cached and still valid (at least 30s before expiration if expiration is provided), reuse
  if (inMemoryGrant) {
    const now = Date.now();
    if (!inMemoryGrant.grant.expiresAtMs || inMemoryGrant.grant.expiresAtMs > now + 30_000) {
      return inMemoryGrant.grant;
    }
  }

  try {
    const result = await request<SystemOneGrant>("/api/systemone/grant", {
      method: "POST",
      body: "{}",
    });
    if (result && typeof result.apiKey === "string" && result.available !== false) {
      inMemoryGrant = { grant: result, fetchedAt: Date.now() };
      return result;
    }
    return null;
  } catch {
    // Graceful fallback: legacy servers without the grant endpoint return 404 or connection failure
    return null;
  }
}

export function clearSystemOneGrantCache(): void {
  inMemoryGrant = null;
}
