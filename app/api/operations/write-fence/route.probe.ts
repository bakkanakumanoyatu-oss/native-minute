import { createWriteFenceResponse, WRITE_FENCE_STATUS_PATH } from "@/lib/operations/write-fence";

export const dynamic = "force-dynamic";

export function GET() {
  return createWriteFenceResponse("GET", WRITE_FENCE_STATUS_PATH)!;
}

export function HEAD() {
  return createWriteFenceResponse("HEAD", WRITE_FENCE_STATUS_PATH)!;
}
