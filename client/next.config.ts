import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@tva-protocol/sdk', '@tva-protocol/ethers-adapter'],
};

export default nextConfig;
