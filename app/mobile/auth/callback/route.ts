const RECOVERY_PATH = "/mobile/auth/recovery";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive"
};

export function GET() {
  return new Response(null, {
    status: 303,
    headers: {
      ...PRIVATE_RESPONSE_HEADERS,
      Location: RECOVERY_PATH
    }
  });
}
