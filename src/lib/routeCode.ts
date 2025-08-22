// lib/routeCode.ts (Edge-safe: usa Web Crypto)
export async function routeCode(pathname: string, salt = process.env.ROUTE_SALT ?? 's') {
  const enc = new TextEncoder().encode(salt + '|' + pathname);
  const digest = await crypto.subtle.digest('SHA-256', enc);
  const bytes = new Uint8Array(digest);

  // Base32 crockford-like sin dependencias y mayúsculas
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];

  const code = (out.replace(/[^A-Z2-7]/g, '').slice(0, 8) || 'AAAAAAAA');
  return `${code.slice(0,4)}-${code.slice(4,8)}`;
}
