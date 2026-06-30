import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "h264-mp4-encoder"],
  // sharp's libvips .so is dlopen'd at runtime, so file tracing misses it.
  // Force the linux-x64 native binaries into the serverless function bundle.
  outputFileTracingIncludes: {
    "/api/render": [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
