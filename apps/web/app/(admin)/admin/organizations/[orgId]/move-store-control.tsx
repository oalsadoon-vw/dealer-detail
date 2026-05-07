"use client";

import { useState } from "react";
import { moveStoreToOrgAction } from "@/lib/server/actions/admin";

type OrgOption = { id: string; name: string };

export function MoveStoreControl({
  storeId,
  storeName,
  otherOrgs,
}: {
  storeId: string;
  storeName: string;
  otherOrgs: OrgOption[];
}) {
  const [open, setOpen] = useState(false);
  const [targetOrgId, setTargetOrgId] = useState<string>(
    otherOrgs[0]?.id ?? ""
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (otherOrgs.length === 0) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!targetOrgId) return;
    const target = otherOrgs.find((o) => o.id === targetOrgId);
    if (!target) return;
    if (
      !confirm(
        `Move "${storeName}" to "${target.name}"?\n\nAll of this store's data (advisors, ingested files, runs, daily metrics, email sources) will move with it. Existing store-level access assignments in the current org will be cleared.`
      )
    )
      return;

    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("storeId", storeId);
    formData.set("targetOrgId", targetOrgId);
    const result = await moveStoreToOrgAction(formData);
    if (result && !result.ok) {
      setError(result.error);
      setPending(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-fg-muted hover:text-fg-strong transition-colors"
      >
        Move
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <select
        value={targetOrgId}
        onChange={(e) => setTargetOrgId(e.target.value)}
        disabled={pending}
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-fg-strong shadow-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:opacity-50"
      >
        {otherOrgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent text-accent-fg px-2 py-1 text-[11px] font-semibold hover:bg-accent-strong transition-colors disabled:opacity-50"
      >
        {pending ? "Moving..." : "Move"}
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        disabled={pending}
        className="text-[11px] text-fg-muted hover:text-fg-strong disabled:opacity-50"
      >
        Cancel
      </button>
      {error && (
        <span className="ml-2 text-[10px] text-danger">{error}</span>
      )}
    </form>
  );
}
