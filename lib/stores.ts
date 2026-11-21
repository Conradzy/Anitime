export type Store = { id: string; name: string; lat: number; lng: number; crop: string; photo: string; phone: string | null };
import store0 from './stores/marsman-drysdale.json';
export const STORES: Store[] = [store0];
export const CROP_ICONS: Record<string, string> = { Banana: '🍌', Copra: '🥥', Corn: '🌽', Pineapple: '🍍' };
