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

type FormState =
  | { kind: "error"; message: string }
  | { kind: "sent"; email: string }
  | { kind: "magic_link"; email: string }
  | { kind: "email_failed"; email: string; warning: string }
  | null;

export function InviteForm({ stores }: { stores: Store[] }) {
  const [state, setState] = useState<FormState>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const email = (formData.get("email") as string) ?? "";
    const result = await createInviteAction(formData);
    setPending(false);

    if (!result.ok) {
      setState({ kind: "error", message: result.error });
      return;
    }

    if (result.emailDelivery === "failed") {
      setState({
        kind: "email_failed",
        email,
        warning: result.emailWarning,
      });
      return;
    }

    setState({
      kind: result.emailDelivery === "magic_link" ? "magic_link" : "sent",
      email,
    });

    // Reset the form so the next invite starts clean.
    e.currentTarget.reset();
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

      {state?.kind === "error" && (
        <div className="rounded-md bg-danger-soft border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.message}
        </div>
      )}
      {state?.kind === "sent" && (
        <div className="rounded-md bg-success-soft border border-success/20 px-3 py-2 text-sm text-success-fg">
          Invite email sent to <span className="font-medium">{state.email}</span>.
          They'll get a one-click sign-in link from Supabase Auth.
        </div>
      )}
      {state?.kind === "magic_link" && (
        <div className="rounded-md bg-info-soft border border-info/20 px-3 py-2 text-sm text-info-fg">
          <span className="font-medium">{state.email}</span> already has an
          account, so we sent a magic-link sign-in instead. Same end result —
          the invite resolves on their next sign-in.
        </div>
      )}
      {state?.kind === "email_failed" && (
        <div className="rounded-md bg-warning-soft border border-warning/30 px-3 py-2 text-sm">
          <div className="font-semibold text-warning-fg">
            Invite created for {state.email}, but the email failed to send
          </div>
          <div className="mt-1 text-xs text-fg-muted leading-relaxed">
            The invite is in place — they'll still get access when they sign
            in. Configure SMTP in Supabase (Project Settings → Auth → SMTP
            Settings) and make sure <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span>{" "}
            is set in your environment.
          </div>
          <pre className="mt-2 max-h-32 overflow-auto rounded bg-surface-2 p-2 text-[11px] leading-tight text-fg">
            {state.warning}
          </pre>
        </div>
      )}

      <Button type="submit" variant="primary" pending={pending}>
        {pending ? "Sending…" : "Send Invite"}
      </Button>
    </form>
  );
}
