"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Store = { id: string; name: string };

export default function UploadPage() {
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<string>("");
  const [businessDate, setBusinessDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  function fileKey(f: File) {
    return `${f.name}::${f.size}::${f.lastModified}`;
  }

  function addFiles(next: File[]) {
    setFiles((prev) => {
      const seen = new Set<string>();
      const merged: File[] = [];
      for (const f of [...prev, ...next]) {
        const k = fileKey(f);
        if (seen.has(k)) continue;
        seen.add(k);
        merged.push(f);
      }
      return merged;
    });
  }

  useEffect(() => {
    fetch("/api/stores")
      .then((r) => r.json())
      .then((data) => {
        setStores(data);
        if (data?.[0]?.id) setStoreId(data[0].id);
      })
      .catch((e) => setError(String(e)));
  }, []);

  const canSubmit = useMemo(() => Boolean(storeId && businessDate && files.length), [storeId, businessDate, files.length]);

  const parsedResult = result as any;
  const runId: string | undefined = parsedResult?.runId;
  const batchNo: number | undefined = parsedResult?.batchNo;

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("storeId", storeId);
      fd.set("businessDate", businessDate);
      for (const f of files) fd.append("files", f);

      const res = await fetch("/api/ingest", { method: "POST", body: fd });
      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // Non-JSON error (e.g. Next.js error page). Provide a readable snippet.
        throw new Error(`Ingest failed (${res.status}): ${text.slice(0, 200) || "Empty response"}`);
      }
      if (!res.ok) throw new Error(json?.error ?? `Ingest failed (${res.status})`);
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold">Upload</h1>

      <div className="rounded-lg border bg-white p-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <label className="space-y-1 text-sm">
            <div className="font-medium">Store</div>
            <select className="w-full rounded border px-2 py-2" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-sm">
            <div className="font-medium">Business date</div>
            <input className="w-full rounded border px-2 py-2" type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
          </label>

          <label className="space-y-1 text-sm">
            <div className="font-medium">Tekion exports (multiple)</div>
            <input
              ref={fileInputRef}
              className="w-full rounded border px-2 py-2"
              type="file"
              multiple
              accept=".xlsx"
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                addFiles(picked);
                // Allow picking the same file again in a later dialog (browser otherwise won't fire onChange).
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
          </label>
        </div>

        {files.length ? (
          <div className="rounded border bg-zinc-50 p-3 text-sm">
            <div className="mb-2 font-medium">Selected files ({files.length})</div>
            <ul className="space-y-1">
              {files.map((f, idx) => (
                <li key={`${f.name}-${idx}`} className="flex items-center justify-between gap-2">
                  <div className="truncate">
                    {f.name} <span className="text-xs text-zinc-500">({Math.round(f.size / 1024)} KB)</span>
                  </div>
                  <button
                    className="text-xs underline text-zinc-700"
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    type="button"
                    disabled={loading}
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2">
              <button className="text-xs underline text-zinc-700" type="button" onClick={() => setFiles([])} disabled={loading}>
                clear all
              </button>
            </div>
          </div>
        ) : null}

        <button
          className="rounded bg-zinc-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={!canSubmit || loading}
          onClick={submit}
        >
          {loading ? "Ingesting..." : "Ingest"}
        </button>

        {error ? <div className="text-sm text-red-700">Error: {error}</div> : null}
      </div>

      {result ? (
        <div className="rounded-lg border bg-white p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="font-medium">Run summary</div>
            {runId ? (
              <Link className="text-sm underline" href={`/runs/${runId}`}>
                View run details
              </Link>
            ) : null}
          </div>
          {typeof batchNo === "number" ? (
            <div className="mb-2 text-sm">
              <span className="font-medium">Batch #:</span> <span className="font-mono">{batchNo}</span>
            </div>
          ) : null}
          <pre className="overflow-auto text-xs">{JSON.stringify(result, null, 2)}</pre>
        </div>
      ) : null}
    </main>
  );
}


