import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PendingAccessClient from "./pending-access-client";

export const dynamic = "force-dynamic";

export default async function PendingAccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <PendingAccessClient email={user.email ?? ""} />;
}
