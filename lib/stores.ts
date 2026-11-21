export type Store = { id: string; name: string; lat: number; lng: number; crop: string; photo: string; phone: string | null };
import store0 from './stores/marsman-drysdale.json';
import store1 from './stores/lapanday.json';
import store2 from './stores/sumifru.json';
import store3 from './stores/super-green.json';
import store4 from './stores/dbcom.json';
import store5 from './stores/first-coconut.json';
export const STORES: Store[] = [store0, store1, store2, store3, store4, store5];
export const CROP_ICONS: Record<string, string> = { Banana: '🍌', Copra: '🥥', Corn: '🌽', Pineapple: '🍍' };
