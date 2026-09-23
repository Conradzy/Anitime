/** Philippine mobile numbers, stored in one canonical shape: +639XXXXXXXXX. */

/** Accepts 09171234567, 9171234567, 639171234567, +63 917 123 4567 …
 * and returns "+639171234567", or null if it isn't a PH mobile number. */
export function normalizePhPhone(input: string): string | null {
  const digits = String(input).replace(/[^\d+]/g, '').replace(/^\+/, '');
  let rest: string;
  if (digits.startsWith('63')) rest = digits.slice(2);
  else if (digits.startsWith('0')) rest = digits.slice(1);
  else rest = digits;
  // PH mobile numbers are always 9 + 9 more digits.
  if (!/^9\d{9}$/.test(rest)) return null;
  return '+63' + rest;
}

/** "+639171234567" -> "+63 917 ••• ••67" for review screens and receipts. */
export function maskPhone(phone: string): string {
  const n = normalizePhPhone(phone);
  if (!n) return phone;
  const d = n.slice(3); // 9XXXXXXXXX
  return `+63 ${d.slice(0, 3)} ••• ••${d.slice(-2)}`;
}

/** "+639171234567" -> "+63 917 123 4567" (used in the field the user edits). */
export function formatPhPhone(phone: string): string {
  const n = normalizePhPhone(phone);
  if (!n) return phone;
  const d = n.slice(3);
  return `+63 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
