"use client";

import { useState } from "react";
import { updateStoreAssignmentsAction } from "@/lib/server/actions/org-admin";

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
  const [state, setState] = useState<{ error: string; ok?: boolean } | null>(null);
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
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        {stores.map((store) => (
          <label
            key={store.id}
            className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-zinc-50 transition-colors has-[:checked]:border-zinc-400 has-[:checked]:bg-zinc-50"
          >
            <input
              type="checkbox"
              name="storeIds"
              value={store.id}
              defaultChecked={assignedStoreIds.includes(store.id)}
              className="rounded accent-zinc-900"
            />
            <div>
              <div className="text-sm font-medium">{store.name}</div>
              {store.abbreviation && (
                <div className="text-xs text-zinc-500 font-mono">{store.abbreviation}</div>
              )}
            </div>
          </label>
        ))}
        {stores.length === 0 && (
          <p className="text-sm text-zinc-500">No stores in this organization yet.</p>
        )}
      </div>

      {state?.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          Store assignments updated.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
      >
        {pending ? "Saving..." : "Save Assignments"}
      </button>
    </form>
  );
}
