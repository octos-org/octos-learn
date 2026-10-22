export async function historySha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
export async function historyId(parts: unknown[]): Promise<string> {
  return `h-${await historySha256(JSON.stringify(parts))}`;
}
