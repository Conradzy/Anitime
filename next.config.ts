import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `npm run dev` uses ".next". Production builds made while it is running
  // (NEXT_DIST_DIR=.next-build npx next build) go to a separate folder so
  // they can't corrupt the dev server's cache.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
