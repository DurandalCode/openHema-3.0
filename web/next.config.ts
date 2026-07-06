import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // BFF Route Handlers требуют Node runtime (gRPC-клиент через http2).
  output: "standalone",
};

export default nextConfig;
