import { request } from "./client";

export interface PrivateAsrGrant {
  grant: string;
  expiresAtMs: number;
}

export function requestPrivateAsrGrant(): Promise<PrivateAsrGrant> {
  return request<PrivateAsrGrant>("/api/private-asr/grant", {
    method: "POST",
    body: "{}",
  });
}
