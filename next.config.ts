import type { NextConfig } from "next";

function normalizeBasePath(input: string): string {
  const trimmed = input.trim()
  if (!trimmed || trimmed === "/") return ""

  let value = trimmed
  if (!value.startsWith("/")) value = `/${value}`
  if (value.endsWith("/")) value = value.slice(0, -1)
  return value
}

function normalizeAssetPrefix(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ""
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed
}

const configuredBasePath =
  process.env.NEXT_PUBLIC_BASE_PATH !== undefined
    ? process.env.NEXT_PUBLIC_BASE_PATH
    : "/nearby"

const basePath = normalizeBasePath(configuredBasePath)
const assetPrefix = normalizeAssetPrefix(process.env.NEXT_PUBLIC_ASSET_PREFIX ?? "")

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  ...(assetPrefix ? { assetPrefix } : {}),
};

export default nextConfig;