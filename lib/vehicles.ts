// Hauling vehicles and fuel, shared by every "how much to haul this?" panel.

/** Indicative pump price, in pesos per liter. Update this one number when
 * prices move; every panel uses it. */
export const FUEL_PRICE_PER_LITER = 94;

export const VEHICLE_SET = [
  // speed = average road speed in km/h once traffic and stops are counted
  { key: 'van', label: 'Vehicle', cap: 'up to 900 kg', capKg: 900, kmpl: 11, speed: 44 },
  { key: 'light', label: 'Light truck', cap: 'up to 3,000 kg', capKg: 3000, kmpl: 7.4, speed: 38 },
  { key: 'heavy', label: 'Heavy truck', cap: 'up to 12,000 kg', capKg: 12000, kmpl: 4.1, speed: 32 },
] as const;

export const FUEL_SET = [
  { key: 'gasoline', label: 'Gasoline', price: FUEL_PRICE_PER_LITER },
  { key: 'diesel', label: 'Diesel', price: FUEL_PRICE_PER_LITER },
  { key: 'kerosene', label: 'Kerosene', price: FUEL_PRICE_PER_LITER },
] as const;

export type Vehicle = (typeof VEHICLE_SET)[number];

/** Travel time, fuel and fuel cost for a trip of `oneWayKm` (the truck goes
 * there and comes back, so fuel is for the round trip; ETA is one way). */
export function haulEstimate(oneWayKm: number, vehicle: Vehicle, fuelPrice: number) {
  const hours = oneWayKm / vehicle.speed;
  const totalMinutes = Math.max(1, Math.round(hours * 60));
  const roundTripKm = oneWayKm * 2;
  const liters = roundTripKm / vehicle.kmpl;
  return {
    hours,
    etaLabel: totalMinutes >= 60 ? `${Math.floor(totalMinutes / 60)} hr ${totalMinutes % 60} min` : `${totalMinutes} min`,
    roundTripKm,
    liters,
    cost: liters * fuelPrice,
  };
}
