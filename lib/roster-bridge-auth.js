export async function rosterBridgeAuthorized(headers, secret = process.env.SCHOOL_GUARD_ROSTER_SECRET) {
  const supplied = typeof headers?.get === 'function' ? headers.get('x-roster-bridge') : headers?.['x-roster-bridge'];
  if (typeof secret !== 'string' || secret.length < 32 || typeof supplied !== 'string' || supplied.length > 512) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(secret)), crypto.subtle.digest('SHA-256', encoder.encode(supplied))]);
  const left = new Uint8Array(a), right = new Uint8Array(b); let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
