/**
 * Reading the QR code on a Philippine National ID (PhilID / ePhilID).
 *
 * IMPORTANT — what this does and does not prove.
 *
 * The QR carries a JSON payload with the holder's name, birthdate and PhilSys
 * Card Number, plus a PSA digital signature. Verifying that signature needs
 * the PhilSys public key, which is only released to accredited relying
 * parties through PhilSys Check / the eGov PH API. AniTime has no such
 * accreditation, so this module ONLY:
 *
 *   - reads the payload,
 *   - cross-checks the name and birthdate against what the user typed,
 *   - keeps the last 4 digits of the card number.
 *
 * That is a consistency check, not proof of identity, which is why a scan
 * leaves the verification IN_REVIEW for a human rather than APPROVED. When
 * accreditation is granted, verify the signature here and the rest of the
 * flow is unchanged.
 */

export type PhilIdPayload = {
  /** Family name as printed on the card, if the QR exposed one. */
  lastName?: string;
  firstName?: string;
  middleName?: string;
  /** ISO yyyy-mm-dd. */
  birthdate?: string;
  /** PhilSys Card Number — only ever used to derive the last 4 digits. */
  cardNumber?: string;
  /** Place of birth and/or address, when the QR carries them. */
  placeOfBirth?: string;
  address?: string;
  /** A single "full name" field, for QR versions that don't split it. */
  fullName?: string;
  /** True when the payload carried a signature field (not verified). */
  signed: boolean;
};

const ALIASES: Record<keyof Omit<PhilIdPayload, 'signed'>, string[]> = {
  lastName: ['lname', 'lastname', 'ln', 'surname', 'familyname'],
  firstName: ['fname', 'firstname', 'fn', 'givenname', 'givennames'],
  middleName: ['mname', 'middlename', 'mn'],
  birthdate: ['dob', 'dateofbirth', 'birthdate', 'bday', 'birthday'],
  cardNumber: ['pcn', 'philsyscardnumber', 'cardnumber', 'psn', 'idnumber'],
  placeOfBirth: ['pob', 'placeofbirth', 'birthplace'],
  address: ['address', 'residence', 'homeaddress', 'presentaddress'],
  fullName: ['fullname', 'name'],
};

const SIGNATURE_KEYS = ['signature', 'sig', 'alg', 'dsig'];

const normKey = (k: string) => k.toLowerCase().replace(/[^a-z]/g, '');

/** Walks the whole JSON tree collecting the first string found for each
 * known key. The payload has been nested under "subject" in some card
 * versions and flat in others, so the shape is not assumed. */
function collect(node: unknown, found: Record<string, string>, depth = 0): void {
  if (depth > 6 || node === null || typeof node !== 'object') return;
  for (const [rawKey, value] of Object.entries(node as Record<string, unknown>)) {
    const key = normKey(rawKey);
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim();
      if (text && !(key in found)) found[key] = text;
    } else {
      collect(value, found, depth + 1);
    }
  }
}

function pick(found: Record<string, string>, names: string[]): string | undefined {
  for (const n of names) if (found[n]) return found[n];
  return undefined;
}

/** Accepts several written date shapes and returns ISO yyyy-mm-dd. */
export function toIsoDate(raw: string): string | undefined {
  const text = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(text);
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(text);
  if (m) {
    // Ambiguous: 03/04/1990 could be March 4 or 4 March. Only one reading is
    // possible when a part is > 12; otherwise assume the PH-common dd/mm.
    const [a, b] = [+m[1], +m[2]];
    if (a > 12) return iso(+m[3], b, a);
    if (b > 12) return iso(+m[3], a, b);
    return iso(+m[3], b, a);
  }

  m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return iso(+m[3], month, +m[1]);
  }

  m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1;
    if (month > 0) return iso(+m[3], month, +m[2]);
  }
  return undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

function iso(y: number, m: number, d: number): string | undefined {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return undefined;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Parses the raw text a QR scanner produced. Returns null when it isn't a
 * readable PhilID payload at all. */
export function parsePhilIdQr(raw: string): PhilIdPayload | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null; // not JSON: some other QR code entirely
  }
  if (data === null || typeof data !== 'object') return null;

  const found: Record<string, string> = {};
  collect(data, found);

  const birthdateRaw = pick(found, ALIASES.birthdate);
  const payload: PhilIdPayload = {
    lastName: pick(found, ALIASES.lastName),
    firstName: pick(found, ALIASES.firstName),
    middleName: pick(found, ALIASES.middleName),
    birthdate: birthdateRaw ? toIsoDate(birthdateRaw) : undefined,
    cardNumber: pick(found, ALIASES.cardNumber),
    placeOfBirth: pick(found, ALIASES.placeOfBirth),
    address: pick(found, ALIASES.address),
    fullName: pick(found, ALIASES.fullName),
    signed: SIGNATURE_KEYS.some((k) => k in found),
  };

  // A payload with neither a name nor a card number isn't a PhilID.
  if (!payload.lastName && !payload.firstName && !payload.fullName && !payload.cardNumber) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// Matching: forgiving on purpose. People misspell, drop a middle name, swap the
// order of names or write a date another way, and none of that should send an
// honest person to manual review. The bar is "clearly the same person", not
// "identical text".
// ---------------------------------------------------------------------------

const SUFFIXES = ['JR', 'SR', 'II', 'III', 'IV', 'MR', 'MS', 'MRS', 'THE'];

/** Strips accents, punctuation and titles so "Dela Cruz, Juan Jr." and
 * "JUAN DELA CRUZ" produce the same words. "Ñ" becomes "N". */
function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !SUFFIXES.includes(t));
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** 'exact' | 'close' (a typo or two, or a shortened form) | null (different). */
function wordMatch(a: string, b: string): 'exact' | 'close' | null {
  if (a === b) return 'exact';
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  // "Ma." for "Maria" is the most common abbreviation on Philippine IDs.
  if (short === 'MA' && long.startsWith('MAR')) return 'close';
  // "Jun" for "Junior": a shortened form
  if (short.length >= 3 && long.startsWith(short)) return 'close';
  const allowed = long.length >= 9 ? 2 : long.length >= 4 ? 1 : 0;
  return allowed > 0 && editDistance(a, b) <= allowed ? 'close' : null;
}

/** Best match of one word among the account's words. */
function bestMatch(word: string, pool: string[]): 'exact' | 'close' | null {
  let best: 'exact' | 'close' | null = null;
  for (const w of pool) {
    const m = wordMatch(word, w);
    if (m === 'exact') return 'exact';
    if (m === 'close') best = 'close';
  }
  return best;
}

export type MatchStatus = 'match' | 'close' | 'mismatch' | 'missing';

export type NameComparison = { status: MatchStatus; score: number };

/** Compares the account's full name with the name on the card. Order does not
 * matter, a missing middle name is fine, and a small typo counts as "close".
 * Passes when clearly the same person: most of the first- and last-name words
 * line up, including at least one of each. */
export function compareNames(accountFullname: string, payload: PhilIdPayload): NameComparison {
  const account = words(accountFullname);
  const last = words(payload.lastName ?? '');
  const first = words(payload.firstName ?? '');
  // Some QR versions only carry one "full name" field: treat all of it as essential.
  const single = !last.length && !first.length ? words(payload.fullName ?? '') : [];
  if (account.length === 0 || last.length + first.length + single.length === 0) return { status: 'missing', score: 0 };

  const essential = [...last, ...first, ...single];
  const results = essential.map((w) => bestMatch(w, account));
  const hit = results.filter(Boolean).length;
  const score = hit / essential.length;

  const lastHit = last.length ? last.some((w) => bestMatch(w, account)) : true;
  const firstHit = first.length ? first.some((w) => bestMatch(w, account)) : true;
  const passes = score >= 0.75 && lastHit && firstHit;

  if (!passes) return { status: 'mismatch', score };
  return { status: results.every((r) => r === 'exact') ? 'match' : 'close', score };
}

/** Kept for callers that only need yes/no. */
export function nameMatches(accountFullname: string, payload: PhilIdPayload): boolean {
  const s = compareNames(accountFullname, payload).status;
  return s === 'match' || s === 'close';
}

/** Compares birthdates. The same day written differently is already handled by
 * toIsoDate; on top of that, a day/month swap (09/12/2004 vs 12/09/2004, the
 * classic dd/mm vs mm/dd confusion) counts as a match, while a different year or
 * a genuinely different day does not. */
export function compareBirthdates(accountBirthdate: Date | null | undefined, payload: PhilIdPayload): MatchStatus {
  if (!accountBirthdate || !payload.birthdate) return 'missing';
  const a = accountBirthdate.toISOString().slice(0, 10);
  const b = payload.birthdate;
  if (a === b) return 'match';
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  if (ay === by && am === bd && ad === bm) return 'close';
  return 'mismatch';
}

/** Kept for callers that only need yes/no/unknown. */
export function birthdateMatches(accountBirthdate: Date | null | undefined, payload: PhilIdPayload): boolean | null {
  const s = compareBirthdates(accountBirthdate, payload);
  if (s === 'missing') return null;
  return s === 'match' || s === 'close';
}

/** Whole years between a birthdate and today. */
export function ageFrom(isoDate: string, now = new Date()): number {
  const [y, m, d] = isoDate.split('-').map(Number);
  let age = now.getUTCFullYear() - y;
  if (now.getUTCMonth() + 1 < m || (now.getUTCMonth() + 1 === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

/** Provinces whose OFFICIAL name changed after most PhilIDs and PSA civil
 * registry records were already printed with the old one — so an old ID and a
 * current address disagree in spelling only, never in the place they mean.
 * Add another [old, new] pair here if another province gets renamed. */
const PROVINCE_RENAMES: [string, string][] = [
  ['COMPOSTELA VALLEY', 'DAVAO DE ORO'], // renamed by RA 11550, signed 2020
];

/** Appends the other name whenever one side of a rename is present, so a
 * word-by-word comparison sees both no matter which one was typed or printed. */
function withRenamedProvinces(text: string): string {
  const upper = text.toUpperCase();
  const extra = PROVINCE_RENAMES.filter(([oldName, newName]) => upper.includes(oldName) || upper.includes(newName))
    .flatMap(([oldName, newName]) => [oldName, newName]);
  return extra.length ? `${text} ${extra.join(' ')}` : text;
}

/** Compares the card's place of birth / address with the account's residential
 * address. This is INFORMATION ONLY and never blocks anyone: a PhilID normally
 * shows where a person was BORN, which is often not where they live now. It is
 * 'match' when any town, province or region word lines up. */
export function compareLocation(
  payload: PhilIdPayload,
  address: { barangay: string; municipality: string; province: string; region: string } | null
): MatchStatus {
  // Words every place name has ("Tagum CITY" / "Cebu CITY") say nothing about where.
  const generic = new Set(['CITY', 'MUNICIPALITY', 'PROVINCE', 'REGION', 'BARANGAY', 'BRGY', 'POBLACION', 'DEL', 'DELA', 'ISLAND', 'ISLANDS', 'PHILIPPINES']);
  const meaningful = (list: string[]) => list.filter((w) => !generic.has(w));
  const card = meaningful(words(withRenamedProvinces(payload.address ?? payload.placeOfBirth ?? '')));
  if (card.length === 0) return 'missing';
  if (!address) return 'missing';
  const pool = meaningful(
    words(withRenamedProvinces([address.barangay, address.municipality, address.province, address.region].join(' ')))
  );
  const hit = card.some((w) => w.length >= 4 && bestMatch(w, pool));
  return hit ? 'match' : 'mismatch';
}

/** "2004-09-09" -> "September 9, 2004" (for showing the person their own ID data). */
export function prettyDate(isoDate: string | undefined): string | null {
  if (!isoDate) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

/** The name as printed on the card, in reading order. */
export function cardDisplayName(p: PhilIdPayload): string | null {
  const parts = [p.firstName, p.middleName, p.lastName].filter(Boolean);
  const name = (parts.length ? parts.join(' ') : p.fullName) ?? '';
  return name.trim() || null;
}

/** Only the last 4 digits are ever stored. */
export function cardLast4(cardNumber: string | undefined): string | undefined {
  if (!cardNumber) return undefined;
  const digits = cardNumber.replace(/\D/g, '');
  return digits.length >= 4 ? digits.slice(-4) : undefined;
}
