const mobileAuthPrivateHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-store, max-age=0"
  },
  {
    key: "Referrer-Policy",
    value: "no-referrer"
  },
  {
    key: "X-Robots-Tag",
    value: "noindex, nofollow, noarchive"
  }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR?.trim() || ".next",
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          {
            key: "Content-Type",
            value: "application/json"
          }
        ]
      },
      {
        source: "/mobile/auth/callback",
        headers: mobileAuthPrivateHeaders
      },
      {
        source: "/mobile/auth/recovery",
        headers: mobileAuthPrivateHeaders
      }
    ];
  }
};

export default nextConfig;
