"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEmailSourceAction,
  removeEmailSourceAction,
} from "@/lib/server/actions/admin";
import {
  Button,
  Card,
  CardTitle,
  CardDescription,
  FormField,
  Input,
  Badge,
  SectionHeading,
} from "@/components/ui";

type EmailSourceRow = {
  id: string;
  senderEmail: string;
  subjectPattern: string | null;
  isActive: boolean;
  lastProcessedAt: Date | null;
  storeId: string | null;
  storeName: string | null;
};

export function EmailSourcesPanel({
  orgId,
  sources,
}: {
  orgId: string;
  sources: EmailSourceRow[];
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const formData = new FormData(e.currentTarget);
    formData.set("orgId", orgId);
    const result = await addEmailSourceAction(formData);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
      return;
    }
    setPending(false);
    setAdding(false);
    e.currentTarget.reset();
    startTransition(() => router.refresh());
  }

  async function handleRemove(sourceId: string, senderEmail: string) {
    if (
      !confirm(
        `Remove ${senderEmail} as an email source for this organization?\n\nThe cron will stop polling this sender. Existing ingested data is unaffected.`
      )
    )
      return;
    const formData = new FormData();
    formData.set("sourceId", sourceId);
    const result = await removeEmailSourceAction(formData);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    startTransition(() => router.refresh());
  }

  return (
    <section className="space-y-3">
      <SectionHeading
        title={`Email Sources (${sources.length})`}
        description="DMS email addresses the cron polls for this org's daily reports. Attachments are routed to the right store via filename abbreviation matching, scoped to this org's stores only."
        action={
          !adding && (
            <Button
              size="sm"
              onClick={() => {
                setAdding(true);
                setError(null);
              }}
            >
              Add Source
            </Button>
          )
        }
      />

      {adding && (
        <Card>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <FormField label="Sender email" required>
                <Input
                  name="senderEmail"
                  type="email"
                  required
                  disabled={pending}
                  placeholder="reportbuilder@tekion.com"
                />
              </FormField>
              <FormField label="Subject pattern" helper="Optional Gmail filter.">
                <Input
                  name="subjectPattern"
                  disabled={pending}
                  placeholder="DAILY Report"
                />
              </FormField>
            </div>

            {error && (
              <div className="rounded-md bg-danger-soft border border-danger/20 px-3 py-2 text-xs text-danger">
                {error}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                pending={pending}
              >
                {pending ? "Adding..." : "Add source"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}

      {sources.length > 0 ? (
        <div className="rounded-lg border border-line bg-surface overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-surface-2/60 text-fg-subtle">
              <tr className="border-b border-line">
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Sender
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Subject pattern
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Scope
                </th>
                <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Last processed
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle">
              {sources.map((s) => (
                <tr
                  key={s.id}
                  className="hover:bg-accent-soft/40 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-fg-strong">
                    {s.senderEmail}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {s.subjectPattern ?? (
                      <span className="text-fg-subtle italic">— any —</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {s.storeId ? (
                      <Badge tone="neutral">
                        Store: {s.storeName ?? s.storeId}
                      </Badge>
                    ) : (
                      <Badge tone="success">Org-wide</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-fg-muted">
                    {s.lastProcessedAt
                      ? new Date(s.lastProcessedAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(s.id, s.senderEmail)}
                      className="text-xs font-medium text-danger hover:text-danger/80 transition-colors"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !adding && (
          <Card>
            <CardTitle>No email sources configured</CardTitle>
            <CardDescription>
              Reports will not be ingested until at least one source is added.
            </CardDescription>
          </Card>
        )
      )}

      {error && !adding && (
        <p className="text-xs text-danger">{error}</p>
      )}
    </section>
  );
}
