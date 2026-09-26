// Pairing code rules shared by the QR code, the scanner and manual entry.
// The server (redeem_pairing_code) is the authority; this only reads user input.

const PREFIX = 'foodiematch:pair:';
/** 6 characters without 0/O/1/I/L (same as the SQL check). */
const CODE = /^[A-HJKMNP-Z2-9]{6}$/;

/** What the QR code contains. The prefix keeps random QR codes from being read as codes. */
export function qrPayload(code: string): string {
  return PREFIX + code;
}

/**
 * The pairing code in scanned or typed text, or null. Accepts the QR payload or
 * the bare code, any case, with spaces or dashes ("abc-23x").
 */
export function parsePairingCode(text: string): string | null {
  const trimmed = text.trim();
  const body = trimmed.toLowerCase().startsWith(PREFIX) ? trimmed.slice(PREFIX.length) : trimmed;
  const code = body.toUpperCase().replace(/[\s-]/g, '');
  return CODE.test(code) ? code : null;
}

/** Whole seconds until the code expires, never negative. */
export function secondsLeft(expiresAt: string, nowMs: number): number {
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - nowMs) / 1000));
}

/** 545 → "9:05" */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
