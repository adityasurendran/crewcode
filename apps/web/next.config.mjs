// The UI and API ship as ONE server (apps/api/src/app.ts). `next build` emits a
// fully static app to ./out, which the API serves alongside /api. Making the
// export build-only keeps `next dev` (fast refresh) working as normal.
import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

/** @type {(phase: string) => import('next').NextConfig} */
export default (phase) => {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    output: isDev ? undefined : "export",
    images: { unoptimized: true },
    eslint: { ignoreDuringBuilds: true },
  };
};
