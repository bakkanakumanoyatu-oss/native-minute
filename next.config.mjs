/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Dedicated probe artifact: product pages, handlers and middleware cannot enter
  // the deployment graph. This source decision cannot be opened by runtime env.
  pageExtensions: ["probe.ts", "probe.tsx"],
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next"
};

export default nextConfig;
