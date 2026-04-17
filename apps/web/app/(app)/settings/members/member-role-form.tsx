"use client";

import { useState } from "react";
import { updateMemberRoleAction } from "@/lib/server/actions/org-admin";
import { MEMBERSHIP_ROLES } from "@/lib/types/auth";

export function MemberRoleForm({
  membershipId,
  currentRole,
}: {
  membershipId: string;
  currentRole: string;
}) {
  const [state, setState] = useState<{ error: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    formData.set("membershipId", membershipId);
    const result = await updateMemberRoleAction(formData);
    if (!result.ok) setState({ error: result.error });
    else setState(null);
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <select
        name="role"
        defaultValue={currentRole}
        disabled={pending}
        onChange={(e) => {
          const form = e.target.closest("form");
          if (form) form.requestSubmit();
        }}
        className="rounded border border-zinc-200 bg-white px-2 py-1 text-xs focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-50"
      >
        {MEMBERSHIP_ROLES.map((r) => (
          <option key={r} value={r}>
            {r.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      {pending && <span className="text-[10px] text-zinc-400 animate-pulse">saving...</span>}
      {state?.error && <span className="text-[10px] text-red-600">{state.error}</span>}
    </form>
  );
}
