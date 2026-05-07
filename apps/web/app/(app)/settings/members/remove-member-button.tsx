"use client";

import { useState } from "react";
import { removeMemberAction } from "@/lib/server/actions/org-admin";

export function RemoveMemberButton({
  membershipId,
  name,
}: {
  membershipId: string;
  name: string;
}) {
  const [state, setState] = useState<{ error: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleClick() {
    if (!confirm(`Remove ${name} from this organization? They will lose all access.`)) return;
    setPending(true);
    setState(null);
    const formData = new FormData();
    formData.set("membershipId", membershipId);
    const result = await removeMemberAction(formData);
    if (!result.ok) setState({ error: result.error });
    setPending(false);
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-xs font-medium text-danger hover:text-danger/80 transition-colors disabled:opacity-50"
      >
        {pending ? "Removing..." : "Remove"}
      </button>
      {state?.error && (
        <div className="text-[10px] text-danger mt-1">{state.error}</div>
      )}
    </div>
  );
}
