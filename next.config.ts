import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The dev overlay badge sits on top of the sidebar's controls, so it is off.
  devIndicators: false,
  experimental: {
    // A settlement can carry several photographed bills in one go.
    serverActions: { bodySizeLimit: "12mb" },
  },
  outputFileTracingIncludes: {
    // The inbox, the bills and the company's Excel template are read at runtime,
    // so they have to travel with the deployed bundle.
    "/**": ["./data/pack/**"],
  },
};

export default nextConfig;
