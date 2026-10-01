import { createWriteFenceResponse } from "@/lib/operations/write-fence";

export const dynamic = "force-dynamic";

function deny(request: Request) {
  // A fixed non-allowlisted path also fences requests that bypass middleware.
  return createWriteFenceResponse(request.method, "/api/application-blocked")!;
}

export { deny as GET, deny as HEAD, deny as POST, deny as PUT, deny as PATCH, deny as DELETE, deny as OPTIONS };
