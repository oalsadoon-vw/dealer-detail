"use client";

import { useState } from "react";
import { createInviteAction } from "@/lib/server/actions/org-admin";
import { MEMBERSHIP_ROLES } from "@/lib/types/auth";
import { Button, FormField, Input, Select } from "@/components/ui";

type Store = { id: string; name: string };

const ROLE_HINTS: Record<string, string> = {
  org_admin: "Full organization access, all stores",
  store_admin: "Full access to assigned stores",
  manager: "Can upload data to assigned stores",
  viewer: "Read-only access to assigned stores",
};

export function InviteForm({ stores }: { stores: Store[] }) {
  const [state, setState] = useState<{ error?: string; ok?: boolean } | null>(
    null
  );
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const result = await createInviteAction(formData);
    if (!result.ok) setState({ error: result.error });
    else setState({ ok: true });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      <FormField label="Email" required>
        <Input
          name="email"
          type="email"
          required
          placeholder="colleague@company.com"
        />
      </FormField>

      <FormField label="Role">
        <Select name="role" defaultValue="viewer">
          {MEMBERSHIP_ROLES.map((r) => (
            <option key={r} value={r}>
              {r.replace(/_/g, " ")} — {ROLE_HINTS[r]}
            </option>
          ))}
        </Select>
      </FormField>

      {stores.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Store access{" "}
            <span className="font-normal normal-case text-fg-subtle">
              (optional, for non-admin roles)
            </span>
          </legend>
          <div className="space-y-1 max-h-40 overflow-y-auto rounded-md border border-line bg-surface p-2 custom-scrollbar">
            {stores.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surface-2 rounded px-1.5 py-1 transition-colors"
              >
                <input
                  type="checkbox"
                  name="storeIds"
                  value={s.id}
                  className="rounded border-line accent-accent"
                />
                <span className="text-fg">{s.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {state?.error && (
        <div className="rounded-md bg-danger-soft border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div className="rounded-md bg-success-soft border border-success/20 px-3 py-2 text-sm text-success">
          Invite sent! The user will gain access when they sign in.
        </div>
      )}

      <Button type="submit" variant="primary" pending={pending}>
        {pending ? "Sending..." : "Send Invite"}
      </Button>
    </form>
  );
}
