import type { NextConfig } from "next";

const RAILWAY_URL = process.env.RAILWAY_URL || "https://cs323-weekly-production.up.railway.app";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pdf-parse"],
  rewrites: async () => ({
    beforeFiles: [
      {
        source: "/api/:path*",
        destination: `${RAILWAY_URL}/api/:path*`,
      },
    ],
    afterFiles: [],
    fallback: [],
  }),
};

export default nextConfig;
