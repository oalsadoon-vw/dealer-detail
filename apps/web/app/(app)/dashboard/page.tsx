import { redirect } from "next/navigation";

/** Legacy route retired 2026-10 — all stores are Tekion-API synced. */
export default function LegacyRedirect() {
  redirect("/reports/advisors");
}
