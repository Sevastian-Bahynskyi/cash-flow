import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The repo's one agent guide is the root AGENTS.md; Next must not write its own into web/.
  agentRules: false,
  // No floating dev badge: it covers the tab bar in screenshots.
  devIndicators: false,
}

export default nextConfig
