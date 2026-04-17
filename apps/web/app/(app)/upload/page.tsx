import { resolveTenantContext } from "@/lib/server/tenant-context";
import { listAccessibleStores } from "@/lib/server/services/stores";
import { redirect } from "next/navigation";
import { isAppError } from "@/lib/server/errors";
import { roleAtLeast } from "@/lib/types/auth";
import UploadClient from "./upload-client";

export const dynamic = "force-dynamic";

export default async function UploadPage() {
  let tc;
  try {
    tc = await resolveTenantContext();
  } catch (err) {
    if (isAppError(err)) redirect("/login");
    throw err;
  }

  const canUpload =
    tc.user.isPlatformAdmin || roleAtLeast(tc.org.role, "manager");

  if (!canUpload) {
    return (
      <main className="space-y-4">
        <h1 className="text-xl font-semibold">Upload</h1>
        <div className="rounded-lg border bg-white p-4 text-sm text-zinc-500">
          You do not have permission to upload data. Contact your organization
          admin if you believe this is an error.
        </div>
      </main>
    );
  }

  const stores = await listAccessibleStores(tc);

  return (
    <UploadClient
      initialStores={stores.map((s) => ({ id: s.id, name: s.name }))}
    />
  );
}
