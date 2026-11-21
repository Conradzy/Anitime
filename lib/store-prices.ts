import type { Store } from './stores';

// Historical market references, not quotes obtained from these businesses.
const psa = 'https://psa.gov.ph/system/files/aad/Full%20Report,%202023%20to%202025%20Regional%20Value%20of%20Production%20in%20Agriculture%20and%20Fisheries.pdf';
export const PRICE_REFERENCES: Record<string, { min: number; max: number; label: string; url: string; basis: string }> = {
  Banana: { min: 20, max: 23, label: 'PSA · Davao, 2025', url: psa, basis: 'Cavendish farmgate average: ₱21.16/kg. Demo range: ₱20–23/kg.' },
  Corn: { min: 13, max: 15, label: 'PSA · Davao, 2025', url: psa, basis: 'Corn farmgate average: ₱13.98/kg. Demo range: ₱13–15/kg.' },
  Pineapple: { min: 24, max: 27, label: 'PSA · Davao, 2025', url: psa, basis: 'Pineapple farmgate average: ₱25.42/kg. Demo range: ₱24–27/kg.' },
  Copra: { min: 62.5, max: 65, label: 'TM Duché · 16 November 2026', url: 'https://www.tmduche.com/markets/coconut-market-newsletter-16-november-2026/', basis: 'Reported seller quotations in Mindanao, Bicol and Visayas: ₱6,250–6,500 per 100 kg (₱62.50–65/kg).' },
};

export function storePrice(store: Store) {
  const reference = PRICE_REFERENCES[store.crop];
  const seed = Array.from(store.id).reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 0);
  const price = Math.round((reference.min + (seed % 101) / 100 * (reference.max - reference.min)) * 100) / 100;
  return { price, reference };
}
