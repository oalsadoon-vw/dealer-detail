"use client";

import { useActionState } from "react";
import { removeMemberAction } from "@/lib/server/actions/org-admin";

export function RemoveMemberButton({
  membershipId,
  name,
}: {
  membershipId: string;
  name: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      if (!confirm(`Remove ${name} from this organization? They will lose all access.`)) return null;
      formData.set("membershipId", membershipId);
      const result = await removeMemberAction(formData);
      if (!result.ok) return { error: result.error };
      return null;
    },
    null
  );

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="text-xs text-red-600 hover:text-red-800 underline disabled:opacity-50"
      >
        {pending ? "Removing..." : "Remove"}
      </button>
      {state?.error && (
        <div className="text-[10px] text-red-600 mt-1">{state.error}</div>
      )}
    </form>
  );
}
