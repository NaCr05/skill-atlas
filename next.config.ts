import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dynamic reads outside the repository are the product's intended local behavior.
  turbopack: {
    ignoreIssue: [
      {
        path: "**/next.config.ts",
        title: "Encountered unexpected file in NFT list",
      },
    ],
  },
};

export default nextConfig;
