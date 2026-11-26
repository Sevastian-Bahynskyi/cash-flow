import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The repo's one agent guide is the root AGENTS.md; Next must not write its own into web/.
  agentRules: false,
}

export default nextConfig
