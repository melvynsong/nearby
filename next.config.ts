import type { NextConfig } from "next";

function normalizePathPrefix(input: string): string {
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

const publicMountPath = normalizePathPrefix(configuredBasePath)
const assetPrefix = normalizeAssetPrefix(
  process.env.NEXT_PUBLIC_ASSET_PREFIX !== undefined
    ? process.env.NEXT_PUBLIC_ASSET_PREFIX
    : publicMountPath,
)

const nextConfig: NextConfig = {
  ...(assetPrefix ? { assetPrefix } : {}),
  async redirects() {
    // Redirect /nearby/showcase/prawn%20noodles or /nearby/showcase/prawn noodles to /nearby/showcase/prawn-noodles
    return [
      {
        source: `${publicMountPath}/showcase/:slug*`,
        has: [
          {
            type: 'query',
            key: 'slug',
            value: '(.*[\s%20].*)',
          },
        ],
        destination: `${publicMountPath}/showcase/:slug*`,
        permanent: true,
        // This will be handled in middleware for more complex normalization if needed
      },
      // fallback to rewrites
    ];
  },
  async rewrites() {
    if (!publicMountPath) return []

    return [
      {
        source: `${publicMountPath}`,
        destination: "/",
      },
      {
        source: `${publicMountPath}/:path*`,
        destination: "/:path*",
      },
    ]
  },
};

export default nextConfig;