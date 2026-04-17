import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSessionUser } from "@/lib/server/tenant-context";
import { setOrgContext } from "@/lib/auth/org-context";
import { assertMembershipInOrg } from "@/lib/server/authz";
import { isAppError } from "@/lib/server/errors";

const SetOrgSchema = z.object({
  organizationId: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const sessionUser = await resolveSessionUser();

    const json = await req.json().catch(() => null);
    const parsed = SetOrgSchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }

    const { organizationId } = parsed.data;

    // Platform admins can access any org; others need a membership
    if (!sessionUser.isPlatformAdmin) {
      const tc = { user: sessionUser } as Parameters<typeof assertMembershipInOrg>[0];
      assertMembershipInOrg(tc, organizationId);
    }

    await setOrgContext(organizationId);

    return NextResponse.json({ ok: true, organizationId });
  } catch (err) {
    if (isAppError(err)) {
      return NextResponse.json({ error: err.message }, { status: err.statusCode });
    }
    throw err;
  }
}
