"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { createStoreForOrgAction } from "@/lib/server/actions/admin";

export default function CreateStorePage() {
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
        <h1 className="text-xl font-bold mt-2">Create Store</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Add a new dealership location to this organization.
        </p>
      </div>

      <CreateStoreForm orgId={orgId} />
    </div>
  );
}

function CreateStoreForm({ orgId }: { orgId: string }) {
  const [state, setState] = useState<{ error: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    formData.set("orgId", orgId);
    const result = await createStoreForOrgAction(formData);
    if (!result.ok) setState({ error: result.error });
    setPending(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block space-y-1">
        <span className="text-sm text-zinc-400">Store name</span>
        <input
          name="name"
          required
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          placeholder="e.g., BMW of Springfield"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-zinc-400">Abbreviation (optional)</span>
        <input
          name="abbreviation"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white font-mono placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          placeholder="e.g., BST"
        />
        <span className="text-xs text-zinc-600">
          Used for matching filenames during email ingestion. Stored uppercase.
        </span>
      </label>

      <label className="block space-y-1">
        <span className="text-sm text-zinc-400">Timezone (optional)</span>
        <input
          name="timezone"
          className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500"
          placeholder="e.g., America/Los_Angeles"
        />
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
        {pending ? "Creating..." : "Create Store"}
      </button>
    </form>
  );
}
