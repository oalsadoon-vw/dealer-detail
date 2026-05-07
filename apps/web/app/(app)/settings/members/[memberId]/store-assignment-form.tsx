"use client";

import { useState } from "react";
import { updateStoreAssignmentsAction } from "@/lib/server/actions/org-admin";
import { Button } from "@/components/ui";

type Store = { id: string; name: string; abbreviation: string | null };

export function StoreAssignmentForm({
  membershipId,
  stores,
  assignedStoreIds,
}: {
  membershipId: string;
  stores: Store[];
  assignedStoreIds: string[];
}) {
  const [state, setState] = useState<{ error: string; ok?: boolean } | null>(
    null
  );
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    formData.set("membershipId", membershipId);
    const result = await updateStoreAssignmentsAction(formData);
    if (!result.ok) setState({ error: result.error });
    else setState({ error: "", ok: true });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        {stores.map((store) => (
          <label
            key={store.id}
            className="flex items-center gap-3 rounded-md border border-line bg-surface p-3 cursor-pointer hover:bg-surface-2 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft/50"
          >
            <input
              type="checkbox"
              name="storeIds"
              value={store.id}
              defaultChecked={assignedStoreIds.includes(store.id)}
              className="rounded border-line accent-accent"
            />
            <div>
              <div className="text-sm font-medium text-fg-strong">
                {store.name}
              </div>
              {store.abbreviation && (
                <div className="text-xs text-fg-subtle font-mono">
                  {store.abbreviation}
                </div>
              )}
            </div>
          </label>
        ))}
        {stores.length === 0 && (
          <p className="text-sm text-fg-muted">
            No stores in this organization yet.
          </p>
        )}
      </div>

      {state?.error && (
        <div className="rounded-md bg-danger-soft border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="rounded-md bg-success-soft border border-success/20 px-3 py-2 text-sm text-success">
          Store assignments updated.
        </div>
      )}

      <Button type="submit" variant="primary" pending={pending}>
        {pending ? "Saving..." : "Save Assignments"}
      </Button>
    </form>
  );
}
