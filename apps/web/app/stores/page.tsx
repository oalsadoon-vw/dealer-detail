"use client";

import { useEffect, useMemo, useState } from "react";

type Store = { id: string; name: string; abbreviation?: string | null; timezone?: string | null; createdAt?: string };

export default function StoresPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [name, setName] = useState("");
  const [abbreviation, setAbbreviation] = useState("");
  const [timezone, setTimezone] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canCreate = useMemo(() => name.trim().length > 0 && !loading, [name, loading]);

  async function refresh() {
    const res = await fetch("/api/stores");
    const json = await res.json();
    setStores(json ?? []);
  }

  useEffect(() => {
    refresh().catch((e) => setError(String(e)));
  }, []);

  async function createStore() {
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          abbreviation: abbreviation.trim() || undefined,
          timezone: timezone.trim() || undefined
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to create store");
      setName("");
      setAbbreviation("");
      setTimezone("");
      setSuccess(`Created store '${json.name}'`);
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold">Stores</h1>

      <div className="rounded-lg border bg-white p-4 space-y-4">
        <div className="text-sm text-zinc-600">
          Create a store so uploads/runs can be separated by dealership. (Timezone is optional for now.)
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <div className="font-medium">Store name</div>
            <input className="w-full rounded border px-2 py-2" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g., BMW of Somewhere" />
          </label>

          <label className="space-y-1 text-sm">
            <div className="font-medium">Abbreviation (optional)</div>
            <input
              className="w-full rounded border px-2 py-2"
              value={abbreviation}
              onChange={(e) => setAbbreviation(e.target.value)}
              placeholder="e.g., BST"
            />
            <div className="text-xs text-zinc-500">Used for filename mapping. Stored uppercase.</div>
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
            <button className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50" disabled={!canCreate} onClick={createStore}>
              {loading ? "Creating..." : "Create store"}
            </button>
          </div>
        </div>

        {error ? <div className="text-sm text-red-700">Error: {error}</div> : null}
        {success ? <div className="text-sm text-green-700">{success}</div> : null}
      </div>

      <div className="rounded-lg border bg-white overflow-auto">
        <table className="min-w-[700px] w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left">
            <tr>
              <th className="p-3">Name</th>
              <th className="p-3">Abbrev</th>
              <th className="p-3">Timezone</th>
              <th className="p-3">Id</th>
            </tr>
          </thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id} className="border-b last:border-b-0">
                <td className="p-3 font-medium">{s.name}</td>
                <td className="p-3 font-mono">{s.abbreviation ?? ""}</td>
                <td className="p-3">{s.timezone ?? ""}</td>
                <td className="p-3 font-mono text-xs">{s.id}</td>
              </tr>
            ))}
            {stores.length === 0 ? (
              <tr>
                <td className="p-3 text-zinc-500" colSpan={4}>
                  No stores yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}


