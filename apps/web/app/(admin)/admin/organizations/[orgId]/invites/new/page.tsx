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

function InviteForm({ orgId }: { orgId: string }) {
  const [state, setState] = useState<{ error: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    formData.set("orgId", orgId);
    const result = await createInviteForOrgAction(formData);
    if (result && !result.ok) {
      setState({ error: result.error });
      setPending(false);
    }
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

      {state?.error && (
        <div className="rounded-md bg-danger-soft border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" pending={pending}>
          {pending ? "Sending..." : "Send Invite"}
        </Button>
        <Link
          href={`/admin/organizations/${orgId}`}
          className="text-sm text-fg-muted hover:text-fg-strong transition-colors"
        >
          Cancel
        </Link>
      </div>

      <p className="text-xs text-fg-subtle">
        The invite will be valid for 30 days. When the user signs in with this
        email, they will automatically receive access.
      </p>
    </form>
  );
}
