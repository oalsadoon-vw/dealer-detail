"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addEmailSourceAction,
  removeEmailSourceAction,
} from "@/lib/server/actions/admin";

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
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Email Sources ({sources.length})</h2>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true);
              setError(null);
            }}
            className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 transition-colors"
          >
            Add Source
          </button>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        DMS email addresses the cron polls for this org&apos;s daily reports.
        Attachments are routed to the right store via filename abbreviation
        matching, scoped to this org&apos;s stores only.
      </p>

      {adding && (
        <form
          onSubmit={handleAdd}
          className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-4 space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">Sender email</span>
              <input
                name="senderEmail"
                type="email"
                required
                disabled={pending}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                placeholder="reportbuilder@tekion.com"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs text-zinc-400">
                Subject pattern <span className="text-zinc-600">(optional)</span>
              </span>
              <input
                name="subjectPattern"
                disabled={pending}
                className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                placeholder="DAILY Report"
              />
            </label>
          </div>

          {error && (
            <div className="rounded-md bg-red-900/40 border border-red-800 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-white text-zinc-950 px-3 py-1.5 text-xs font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
            >
              {pending ? "Adding..." : "Add source"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setError(null);
              }}
              disabled={pending}
              className="rounded-md border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {sources.length > 0 ? (
        <div className="rounded-lg border border-zinc-800 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-zinc-800 bg-zinc-900/50">
              <tr>
                <th className="text-left p-3 text-zinc-400 font-medium">
                  Sender
                </th>
                <th className="text-left p-3 text-zinc-400 font-medium">
                  Subject pattern
                </th>
                <th className="text-left p-3 text-zinc-400 font-medium">Scope</th>
                <th className="text-left p-3 text-zinc-400 font-medium">
                  Last processed
                </th>
                <th className="text-right p-3 text-zinc-400 font-medium">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr
                  key={s.id}
                  className="border-b border-zinc-800/50 last:border-b-0"
                >
                  <td className="p-3 font-mono text-xs">{s.senderEmail}</td>
                  <td className="p-3 text-zinc-400">
                    {s.subjectPattern ?? (
                      <span className="text-zinc-600">— any —</span>
                    )}
                  </td>
                  <td className="p-3 text-zinc-400">
                    {s.storeId ? (
                      <span title={s.storeName ?? undefined}>
                        Store: {s.storeName ?? s.storeId}
                      </span>
                    ) : (
                      <span className="text-emerald-400">Org-wide</span>
                    )}
                  </td>
                  <td className="p-3 text-zinc-500">
                    {s.lastProcessedAt
                      ? new Date(s.lastProcessedAt).toLocaleString()
                      : "Never"}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleRemove(s.id, s.senderEmail)}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
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
          <p className="text-sm text-zinc-600">
            No email sources configured. Reports will not be ingested until at
            least one source is added.
          </p>
        )
      )}

      {error && !adding && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </section>
  );
}
