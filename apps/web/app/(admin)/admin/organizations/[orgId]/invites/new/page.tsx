"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { createInviteForOrgAction } from "@/lib/server/actions/admin";
import { MEMBERSHIP_ROLES } from "@/lib/types/auth";
import {
  Button,
  Card,
  FormField,
  Input,
  SectionHeading,
} from "@/components/ui";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  org_admin: "Full organization access. Can manage stores, users, and settings.",
  store_admin: "Full access to assigned stores. Can upload and manage data.",
  manager: "Can upload data and view dashboards for assigned stores.",
  viewer: "Read-only access to dashboards for assigned stores.",
};

export default function CreateInvitePage() {
  const { orgId } = useParams<{ orgId: string }>();

  return (
    <div className="space-y-6 max-w-xl fade-in-up">
      <div>
        <Link
          href={`/admin/organizations/${orgId}`}
          className="inline-flex items-center text-xs text-fg-muted hover:text-fg-strong transition-colors"
        >
          ← Back to organization
        </Link>
        <SectionHeading
          title="Invite Organization Admin"
          description="Send an invite to the first org admin who will manage this dealership group."
          size="page"
          className="mt-2"
        />
      </div>

      <InviteForm orgId={orgId} />
    </div>
  );
}

type SuccessState =
  | { kind: "sent"; email: string }
  | { kind: "magic_link"; email: string }
  | { kind: "email_failed"; email: string; warning: string };

function InviteForm({ orgId }: { orgId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<SuccessState | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);

    const formData = new FormData(e.currentTarget);
    formData.set("orgId", orgId);
    const email = (formData.get("email") as string) ?? "";

    const result = await createInviteForOrgAction(formData);
    setPending(false);

    if (!result || !result.ok) {
      setError(result?.error ?? "Something went wrong");
      return;
    }

    if (result.emailDelivery === "failed") {
      setSuccess({
        kind: "email_failed",
        email,
        warning: result.emailWarning,
      });
      return;
    }

    setSuccess({
      kind: result.emailDelivery === "magic_link" ? "magic_link" : "sent",
      email,
    });
  }

  if (success) {
    return <SuccessPanel orgId={orgId} state={success} />;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card>
        <FormField label="Email address" required>
          <Input
            name="email"
            type="email"
            required
            placeholder="admin@dealership.com"
          />
        </FormField>
      </Card>

      <Card>
        <fieldset className="space-y-2">
          <legend className="text-xs font-semibold uppercase tracking-wider text-fg-muted mb-2">
            Role
          </legend>
          {MEMBERSHIP_ROLES.map((role) => (
            <label
              key={role}
              className="flex items-start gap-3 rounded-md border border-line bg-surface p-3 cursor-pointer hover:bg-surface-2 transition-colors has-[:checked]:border-accent has-[:checked]:bg-accent-soft/40"
            >
              <input
                type="radio"
                name="role"
                value={role}
                defaultChecked={role === "org_admin"}
                className="mt-0.5 accent-accent"
              />
              <div>
                <div className="text-sm font-medium text-fg-strong">
                  {role.replace(/_/g, " ")}
                </div>
                <div className="text-xs text-fg-muted">
                  {ROLE_DESCRIPTIONS[role]}
                </div>
              </div>
            </label>
          ))}
        </fieldset>
      </Card>

      {error && (
        <div className="rounded-md bg-danger-soft border border-danger/20 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" pending={pending}>
          {pending ? "Sending…" : "Send Invite"}
        </Button>
        <Link
          href={`/admin/organizations/${orgId}`}
          className="text-sm text-fg-muted hover:text-fg-strong transition-colors"
        >
          Cancel
        </Link>
      </div>

      <p className="text-xs text-fg-subtle">
        We'll email the recipient a one-click sign-in link. The invite is valid
        for 30 days. They'll be added to the organization automatically the
        first time they sign in.
      </p>
    </form>
  );
}

function SuccessPanel({
  orgId,
  state,
}: {
  orgId: string;
  state: SuccessState;
}) {
  const isFailure = state.kind === "email_failed";

  return (
    <Card variant={isFailure ? "default" : "default"}>
      <div className="space-y-4">
        <div
          className={
            isFailure
              ? "rounded-md bg-warning-soft border border-warning/30 p-3"
              : "rounded-md bg-success-soft border border-success/30 p-3"
          }
        >
          <div className="flex items-start gap-2">
            <span
              className={
                isFailure
                  ? "mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-warning"
                  : "mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-success"
              }
            />
            <div className="space-y-1">
              <div
                className={
                  isFailure
                    ? "text-sm font-semibold text-warning-fg"
                    : "text-sm font-semibold text-success-fg"
                }
              >
                {state.kind === "sent" &&
                  `Invite email sent to ${state.email}`}
                {state.kind === "magic_link" &&
                  `Magic-link sign-in sent to ${state.email}`}
                {state.kind === "email_failed" &&
                  `Invite created for ${state.email}, but the email failed to send`}
              </div>
              <div className="text-xs text-fg-muted leading-relaxed">
                {state.kind === "sent" &&
                  "They'll get an email from Supabase Auth with a link to sign in. Once they click it, they'll be added to the organization automatically."}
                {state.kind === "magic_link" &&
                  "This recipient already has an account, so we sent a magic-link sign-in instead of a fresh invite. Same end result — the invite resolves on their next sign-in."}
                {state.kind === "email_failed" && (
                  <>
                    The invite row is in place, so the recipient will still get
                    access on their next sign-in (auto-resolved by email
                    match). To deliver the email, fix the SMTP config in your
                    Supabase project: <span className="font-mono">Project Settings → Auth → SMTP Settings</span>{" "}
                    or set <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> in <span className="font-mono">.env</span>.
                  </>
                )}
              </div>
              {state.kind === "email_failed" && (
                <pre className="mt-2 max-h-32 overflow-auto rounded bg-surface-2 p-2 text-[11px] leading-tight text-fg">
                  {state.warning}
                </pre>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/admin/organizations/${orgId}`}
            className="inline-flex items-center justify-center h-9 rounded-md border border-line bg-surface px-3 text-sm text-fg-strong shadow-sm transition-colors hover:bg-surface-2"
          >
            Back to organization
          </Link>
          <Link
            href={`/admin/organizations/${orgId}/invites/new`}
            className="text-sm text-fg-muted hover:text-fg-strong transition-colors"
            onClick={(e) => {
              // Force a fresh form (the success state is in component state).
              e.preventDefault();
              window.location.reload();
            }}
          >
            Send another invite
          </Link>
        </div>
      </div>
    </Card>
  );
}
