"use client";

import { useActionState } from "react";
import { createInviteAction } from "@/lib/server/actions/org-admin";
import { MEMBERSHIP_ROLES } from "@/lib/types/auth";

type Store = { id: string; name: string };

const ROLE_HINTS: Record<string, string> = {
  org_admin: "Full organization access, all stores",
  store_admin: "Full access to assigned stores",
  manager: "Can upload data to assigned stores",
  viewer: "Read-only access to assigned stores",
};

export function InviteForm({ stores }: { stores: Store[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error?: string; ok?: boolean } | null, formData: FormData) => {
      const result = await createInviteAction(formData);
      if (!result.ok) return { error: result.error };
      return { ok: true };
    },
    null
  );

  return (
    <form action={formAction} className="space-y-4 max-w-lg">
      <label className="block space-y-1">
        <span className="text-sm text-zinc-600">Email</span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-md border px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
          placeholder="colleague@company.com"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-zinc-600">Role</span>
        <select
          name="role"
          defaultValue="viewer"
          className="w-full rounded-md border px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400"
        >
          {MEMBERSHIP_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ")} — {ROLE_HINTS[r]}
            </option>
          ))}
        </select>
      </label>

      {stores.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-sm text-zinc-600">
            Store access <span className="text-zinc-400">(optional, for non-admin roles)</span>
          </legend>
          <div className="space-y-1 max-h-40 overflow-y-auto rounded border p-2">
            {stores.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-zinc-50 rounded px-1 py-0.5">
                <input type="checkbox" name="storeIds" value={s.id} className="rounded accent-zinc-900" />
                {s.name}
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state?.error && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          Invite sent! The user will gain access when they sign in.
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 text-white px-4 py-2 text-sm font-medium hover:bg-zinc-800 transition-colors disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send Invite"}
      </button>
    </form>
  );
}
