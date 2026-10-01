import { createWriteFenceResponse } from "@/lib/operations/write-fence";

export const dynamic = "force-dynamic";

function deny(request: Request) {
  // Product handlers are absent from this build; this final route cannot load
  // Auth, DB, Storage, quota, provider or deletion/operator implementations.
  return createWriteFenceResponse(request.method, "/api/application-blocked")!;
}

export { deny as GET, deny as HEAD, deny as POST, deny as PUT, deny as PATCH, deny as DELETE, deny as OPTIONS };
