// Starts downloading the 3D map's code (the component and CesiumJS, the big
// part) so that opening the Deliveries page is quick. It deliberately does NOT
// create the map or request any Google tiles — that only happens on the page.
let started = false;

export function preloadDeliveryMap() {
  if (started || !process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return;
  started = true;
  void import('@/components/DeliveryMap3D');
  void import('cesium');
}
