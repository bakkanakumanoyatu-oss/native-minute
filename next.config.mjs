const projectRoot = process.cwd();

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  experimental: {
    outputFileTracingRoot: projectRoot
  }
};

export default nextConfig;
