import type { NextConfig } from "next";

const envBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() ?? "";
const cleanedBasePath = envBasePath.replace(/^\/+|\/+$/g, "");
const normalizedBasePath = cleanedBasePath ? `/${cleanedBasePath}` : "";

const nextConfig: NextConfig = {
  ...(normalizedBasePath ? { basePath: normalizedBasePath } : {}),
};

export default nextConfig;
