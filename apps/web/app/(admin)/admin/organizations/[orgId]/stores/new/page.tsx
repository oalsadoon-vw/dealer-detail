"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { createStoreForOrgAction } from "@/lib/server/actions/admin";
import {
  Button,
  Card,
  FormField,
  Input,
  SectionHeading,
} from "@/components/ui";

export default function CreateStorePage() {
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
          title="Create Store"
          description="Add a new dealership location to this organization."
          size="page"
          className="mt-2"
        />
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
    if (result && !result.ok) {
      setState({ error: result.error });
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card>
        <div className="space-y-4">
          <FormField label="Store name" required>
            <Input
              name="name"
              required
              placeholder="e.g. BMW of Springfield"
            />
          </FormField>

          <FormField
            label="Abbreviation"
            helper="Used for matching filenames during email ingestion. Stored uppercase."
          >
            <Input
              name="abbreviation"
              placeholder="e.g. BST"
              className="font-mono"
            />
          </FormField>

          <FormField label="Timezone">
            <Input
              name="timezone"
              placeholder="e.g. America/Los_Angeles"
            />
          </FormField>
        </div>
      </Card>

      {state?.error && (
        <div className="rounded-md bg-danger-soft border border-danger/20 px-3 py-2 text-sm text-danger">
          {state.error}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary" pending={pending}>
          {pending ? "Creating..." : "Create Store"}
        </Button>
        <Link
          href={`/admin/organizations/${orgId}`}
          className="text-sm text-fg-muted hover:text-fg-strong transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
