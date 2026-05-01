"use client";

import { useState } from "react";
import { deleteOrganizationAction } from "@/lib/server/actions/admin";

export function DeleteOrganizationButton({
  orgId,
  orgName,
  orgSlug,
  storeCount,
}: {
  orgId: string;
  orgName: string;
  orgSlug: string;
  storeCount: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = storeCount > 0;

  async function handleClick() {
    if (disabled) return;

    const typed = window.prompt(
      `Permanently delete the "${orgName}" organization?\n\nAll memberships and invites tied to this org will be removed. (This org has 0 stores, so no store data is affected.) This cannot be undone.\n\nType the organization slug to confirm:`
    );
    if (typed === null) return;
    if (typed !== orgSlug) {
      setError("Confirmation did not match the organization slug. Nothing was deleted.");
      return;
    }

    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("orgId", orgId);
    formData.set("confirm", typed);
    const result = await deleteOrganizationAction(formData);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={disabled || pending}
        title={
          disabled
            ? "Move or delete all stores in this organization first."
            : `Permanently delete ${orgName}`
        }
        className="rounded-md border border-red-900/60 bg-red-950/30 px-4 py-2 text-sm font-medium text-red-300 transition-colors hover:bg-red-950/50 hover:border-red-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-950/30"
      >
        {pending ? "Deleting..." : "Delete organization"}
      </button>
      {disabled && (
        <p className="text-xs text-zinc-600">
          Organizations with stores cannot be deleted. Move or delete all{" "}
          {storeCount} store{storeCount === 1 ? "" : "s"} first.
        </p>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
