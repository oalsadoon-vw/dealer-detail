"use client";

import { useMemo, useState } from "react";
import { fetchApi } from "@/lib/client/fetch-api";

type Store = {
  id: string;
  name: string;
  abbreviation?: string | null;
  timezone?: string | null;
};

export default function StoresManager({
  initialStores = [],
  canCreate = false,
}: {
  initialStores?: Store[];
  canCreate?: boolean;
}) {
  const [stores, setStores] = useState<Store[]>(initialStores);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canSubmit = useMemo(
    () => name.trim().length > 0 && !loading,
    [name, loading]
  );

  async function createStore() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const json = await fetchApi<Store>("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          abbreviation: abbreviation.trim() || undefined,
          timezone: timezone.trim() || undefined,
        }),
      });
      setName("");
      setAbbreviation("");
      setTimezone("");
      setSuccess(`Created store '${json.name}'`);
      const refreshed = await fetchApi<Store[]>("/api/stores");
      setStores(refreshed);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {canCreate && (
        <div className="rounded-lg border bg-white p-4 space-y-4">
          <div className="text-sm text-zinc-600">
            Add a new dealership location to your organization.
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <label className="space-y-1 text-sm">
              <div className="font-medium">Store name</div>
              <input
                className="w-full rounded border px-2 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., BMW of Somewhere"
              />
            </label>

            <label className="space-y-1 text-sm">
              <div className="font-medium">Abbreviation (optional)</div>
              <input
                className="w-full rounded border px-2 py-2"
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value)}
                placeholder="e.g., BST"
              />
              <div className="text-xs text-zinc-500">
                Used for filename mapping. Stored uppercase.
              </div>
            </label>

            <label className="space-y-1 text-sm">
              <div className="font-medium">Timezone (optional)</div>
              <input
                className="w-full rounded border px-2 py-2"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g., America/Los_Angeles"
              />
            </label>

            <div className="flex items-end">
              <button
                className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
                disabled={!canSubmit}
                onClick={createStore}
              >
                {loading ? "Creating..." : "Create store"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="text-sm text-red-700">Error: {error}</div>
          ) : null}
          {success ? (
            <div className="text-sm text-green-700">{success}</div>
          ) : null}
        </div>
      )}

      <div className="rounded-lg border bg-white overflow-auto">
        <table className="min-w-[600px] w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Abbreviation</th>
              <th className="p-3">Timezone</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-b last:border-b-0">
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 font-mono text-zinc-500">
                  {s.abbreviation ?? "—"}
                </td>
                <td className="p-3 text-zinc-500">{s.timezone ?? "—"}</td>
              </tr>
            ))}
            {stores.length === 0 ? (
              <tr>
                <td className="p-3 text-zinc-500" colSpan={3}>
                  {canCreate
                    ? "No stores yet. Create one above."
                    : "No stores in this organization yet."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
