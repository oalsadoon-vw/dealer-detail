"use client";

import Link from "next/link";
import { useState } from "react";
import { createOrganizationAction } from "@/lib/server/actions/admin";
import {
  Button,
  Card,
  CardTitle,
  CardDescription,
  FormField,
  Input,
  SectionHeading,
} from "@/components/ui";

export default function CreateOrganizationPage() {
  return (
    <div className="space-y-6 max-w-xl fade-in-up">
      <div>
        <Link
          href="/admin/organizations"
          className="inline-flex items-center text-xs text-fg-muted hover:text-fg-strong transition-colors"
        >
          ← Organizations
        </Link>
        <SectionHeading
          title="Create Organization"
          description="Set up a new dealership group / customer organization."
          size="page"
          className="mt-2"
        />
      </div>

      <CreateOrgForm />
    </div>
  );
}

function CreateOrgForm() {
  const [state, setState] = useState<{ error: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState(null);
    const formData = new FormData(e.currentTarget);
    const result = await createOrganizationAction(formData);
    // On success the action redirect()s; the awaited value is undefined.
    if (result && !result.ok) {
      setState({ error: result.error });
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Card>
        <CardTitle>Identity</CardTitle>
        <div className="mt-4 space-y-4">
          <FormField label="Organization name" required>
            <Input
              name="name"
              required
              placeholder="e.g. Acme Auto Group"
            />
          </FormField>

          <FormField
            label="Slug"
            required
            helper="Lowercase, numbers, and hyphens only. Must be unique."
          >
            <Input
              name="slug"
              required
              pattern="[a-z0-9-]+"
              placeholder="e.g. acme-auto"
              className="font-mono"
            />
          </FormField>
        </div>
      </Card>

      <Card>
        <CardTitle>Email source (optional)</CardTitle>
        <CardDescription>
          The DMS email address that delivers this org&apos;s daily reports.
          Typical setup is one org-wide source (e.g.{" "}
          <span className="font-mono">reportbuilder@tekion.com</span>) that
          covers every store in the org. Leave blank to add later.
        </CardDescription>
        <div className="mt-4 space-y-4">
          <FormField label="Sender email">
            <Input
              name="senderEmail"
              type="email"
              placeholder="reportbuilder@tekion.com"
            />
          </FormField>

          <FormField
            label="Subject pattern"
            helper="Gmail search filter applied alongside the sender. Leave blank to accept any subject."
          >
            <Input name="subjectPattern" placeholder="e.g. DAILY Report" />
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
          {pending ? "Creating..." : "Create Organization"}
        </Button>
        <Link
          href="/admin/organizations"
          className="text-sm text-fg-muted hover:text-fg-strong transition-colors"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
