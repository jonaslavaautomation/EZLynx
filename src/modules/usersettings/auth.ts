/*
 * Password hashing (PBKDF2-SHA256) and authenticator-app codes (TOTP, RFC 6238) using the browser's WebCrypto.
 * These protect the training sign-in only; real authentication belongs in Supabase Auth.
 */

const enc = new TextEncoder();
const PBKDF2_ITERATIONS = 210_000;

const toB64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/** Returns { hash, salt } (both base64) for a new password. */
export async function hashPassword(password: string, saltB64?: string) {
  const salt = saltB64 ? fromB64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS }, key, 256);
  return { hash: toB64(new Uint8Array(bits)), salt: toB64(salt) };
}

/** Constant-time comparison of a password against a stored hash + salt. */
export async function verifyPassword(password: string, hash: string, salt: string) {
  const { hash: candidate } = await hashPassword(password, salt);
  if (candidate.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= candidate.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

export type PasswordRule = { label: string; ok: boolean };

export function passwordRules(pw: string): PasswordRule[] {
  return [
    { label: 'At least 10 characters', ok: pw.length >= 10 },
    { label: 'An uppercase letter', ok: /[A-Z]/.test(pw) },
    { label: 'A lowercase letter', ok: /[a-z]/.test(pw) },
    { label: 'A number', ok: /\d/.test(pw) },
    { label: 'A symbol', ok: /[^A-Za-z0-9]/.test(pw) },
  ];
}

// ── TOTP ──

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}

/** A new random 160-bit secret, base32-encoded (what authenticator apps expect). */
export function newTotpSecret() {
  return base32Encode(crypto.getRandomValues(new Uint8Array(20)));
}

export function otpauthUri(secret: string, account: string, issuer = 'LAVA AMS') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

/** The TOTP code for a raw key at a given unix time (seconds). */
export async function totpAt(key: Uint8Array, unixSeconds: number, digits = 6, period = 30) {
  const counter = Math.floor(unixSeconds / period);
  const msg = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) { msg[i] = c & 255; c = Math.floor(c / 256); }
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', k, msg));
  const off = h[h.length - 1] & 15;
  const bin = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** Checks a 6-digit code against the secret, allowing one 30-second step of clock drift either way. */
export async function verifyTotp(secret: string, code: string, now = Date.now()) {
  const c = code.replace(/\D/g, '');
  if (c.length !== 6) return false;
  const key = base32Decode(secret);
  const t = Math.floor(now / 1000);
  for (const drift of [0, -30, 30]) if ((await totpAt(key, t + drift)) === c) return true;
  return false;
}
