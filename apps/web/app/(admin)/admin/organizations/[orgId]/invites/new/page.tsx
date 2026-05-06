"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { createInviteForOrgAction } from "@/lib/server/actions/admin";
import { MEMBERSHIP_ROLES } from "@/lib/types/auth";

const ROLE_DESCRIPTIONS: Record<string, string> = {
  org_admin: "Full organization access. Can manage stores, users, and settings.",
  store_admin: "Full access to assigned stores. Can upload and manage data.",
  manager: "Can upload data and view dashboards for assigned stores.",
  viewer: "Read-only access to dashboards for assigned stores.",
};

export default function CreateInvitePage() {
  const { orgId } = useParams<{ orgId: string }>();

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <Link
          href={`/admin/organizations/${orgId}`}
          className="text-xs text-zinc-500 hover:text-zinc-300"
        >
          &larr; Back to organization
        </Link>
        <h1 className="text-xl font-bold mt-2">Invite Organization Admin</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Send an invite to the first org admin who will manage this dealership group.
        </p>
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
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm text-zinc-400">Email address</span>
        <input
          name="email"
          type="email"
          required
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          placeholder="admin@dealership.com"
        />
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm text-zinc-400">Role</legend>
        {MEMBERSHIP_ROLES.map((role) => (
          <label
            key={role}
            className="flex items-start gap-3 rounded-md border border-zinc-800 bg-zinc-900/50 p-3 cursor-pointer hover:bg-zinc-900 transition-colors has-[:checked]:border-zinc-600 has-[:checked]:bg-zinc-900"
          >
            <input
              type="radio"
              name="role"
              value={role}
              defaultChecked={role === "org_admin"}
              className="mt-0.5 accent-white"
            />
            <div>
              <div className="text-sm font-medium">{role.replace(/_/g, " ")}</div>
              <div className="text-xs text-zinc-500">
                {ROLE_DESCRIPTIONS[role]}
              </div>
            </div>
          </label>
        ))}
      </fieldset>

      {state?.error && (
        <div className="rounded-md bg-red-900/40 border border-red-800 px-3 py-2 text-sm text-red-300">
          {state.error}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white text-zinc-950 px-4 py-2 text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
      >
        {pending ? "Sending..." : "Send Invite"}
      </button>

      <p className="text-xs text-zinc-600">
        The invite will be valid for 30 days. When the user signs in with this
        email, they will automatically receive access.
      </p>
    </form>
  );
}
