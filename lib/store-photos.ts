import type { Store } from './stores';

const additionalPhotos: Record<string, string[]> = {
  'marsman-drysdale': ['Marsman Drysdale 2.jpeg', 'Marsman Drysdale 3.jpeg'],
  lapanday: ['Lapanday Foods 2.jpeg'],
  'new-hope': ['new hope davao 2.jpeg'],
  'perfect-milling': ['perfect milling corp 1.jpeg'],
  lzy: ['lzy rice corn trader.png'],
};

export function storePhotos(store: Store) {
  return [store.photo, ...(additionalPhotos[store.id] ?? []).map(name => `/uploads/stores%20pictures/${encodeURIComponent(name)}`)];
}
