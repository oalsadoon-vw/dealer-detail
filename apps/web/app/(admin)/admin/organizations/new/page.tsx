"use client";

import Link from "next/link";
import { useActionState } from "react";
import { createOrganizationAction } from "@/lib/server/actions/admin";

export default function CreateOrganizationPage() {
  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <Link href="/admin/organizations" className="text-xs text-zinc-500 hover:text-zinc-300">
          &larr; Organizations
        </Link>
        <h1 className="text-xl font-bold mt-2">Create Organization</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Set up a new dealership group / customer organization.
        </p>
      </div>

      <CreateOrgForm />
    </div>
  );
}

function CreateOrgForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: { error: string } | null, formData: FormData) => {
      const result = await createOrganizationAction(formData);
      if (!result.ok) return { error: result.error };
      return null;
    },
    null
  );

  return (
    <form action={formAction} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm text-zinc-400">Organization name</span>
        <input
          name="name"
          required
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          placeholder="e.g., Acme Auto Group"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-zinc-400">Slug</span>
        <input
          name="slug"
          required
          pattern="[a-z0-9-]+"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white font-mono placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          placeholder="e.g., acme-auto"
        />
        <span className="text-xs text-zinc-600">
          Lowercase, numbers, and hyphens only. Must be unique.
        </span>
      </label>

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
        {pending ? "Creating..." : "Create Organization"}
      </button>
    </form>
  );
}
