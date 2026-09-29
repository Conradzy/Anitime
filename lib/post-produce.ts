// Lets any page open the "Post your produce" modal that the sidebar hosts.
export const OPEN_POST_PRODUCE_EVENT = 'anitime:open-post-produce';

export function openPostProduce() {
  window.dispatchEvent(new Event(OPEN_POST_PRODUCE_EVENT));
}

// Fired after listings are published, so feeds can refresh themselves.
export const LISTING_POSTED_EVENT = 'anitime:listing-posted';

// The mirror of the above, for "Post a buying request".
export const OPEN_BUY_REQUEST_EVENT = 'anitime:open-buy-request';

export function openBuyRequest() {
  window.dispatchEvent(new Event(OPEN_BUY_REQUEST_EVENT));
}

export const BUY_REQUEST_POSTED_EVENT = 'anitime:buy-request-posted';
