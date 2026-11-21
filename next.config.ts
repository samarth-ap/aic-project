import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets phones on the same network use the dev server (PUBLIC_URL, e.g. http://192.168.x.x:3000).
  allowedDevOrigins: process.env.PUBLIC_URL ? [new URL(process.env.PUBLIC_URL).hostname] : [],
};

export default nextConfig;
