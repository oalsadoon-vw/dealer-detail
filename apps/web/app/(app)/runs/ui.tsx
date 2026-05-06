"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "@/lib/client/fetch-api";

type Store = { id: string; name: string };
type RunRow = {
  id: string;
  storeId: string;
  businessDate: string;
  batchNo: number;
  status: string;
  createdAt: string;
  files: Array<{ id: string }>;
};

export default function RunsClient({
  initialStores = [],
  initialStoreId = "",
  initialRuns = [],
  canWrite = false,
}: {
  initialStores?: Store[];
  initialStoreId?: string;
  initialRuns?: RunRow[];
  canWrite?: boolean;
}) {
  const [stores] = useState<Store[]>(initialStores);
  const [storeId, setStoreId] = useState(
    initialStoreId || initialStores[0]?.id || ""
  );
  // Hydrate from server-rendered runs so the table is populated on first
  // paint instead of flashing "Loading...".
  const [runs, setRuns] = useState<RunRow[]>(initialRuns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasStore = useMemo(() => Boolean(storeId), [storeId]);

  // Skip the first refetch when the SSR'd runs already match the active
  // store — they're already in state.
  const dataIsFreshRef = useRef<boolean>(
    !!initialRuns.length && storeId === initialStoreId
  );

  useEffect(() => {
    if (!storeId) return;
    if (dataIsFreshRef.current) {
      dataIsFreshRef.current = false;
      return;
    }
    setLoading(true);
    setError(null);
    fetchApi<unknown[]>(`/api/runs?storeId=${storeId}`)
      .then((rs) => {
        const mapped: RunRow[] = (rs ?? []).map((x: any) => ({
          id: x.id,
          storeId: x.storeId,
          businessDate: String(x.businessDate).slice(0, 10),
          batchNo: Number(x.batchNo ?? 0),
          status: String(x.status ?? ""),
          createdAt: String(x.createdAt ?? ""),
          files: Array.isArray(x.files) ? x.files : [],
        }));
        setRuns(mapped);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [storeId]);

  const [processing, setProcessing] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this run? This will remove all data associated with this run and re-calculate the daily totals."
      )
    )
      return;
    setProcessing(id);
    try {
      await fetchApi(`/api/runs/${id}`, { method: "DELETE" });
      setRuns((prev) => prev.filter((x) => x.id !== id));
    } catch (e) {
      alert("Error deleting run: " + e);
    } finally {
      setProcessing(null);
    }
  };

  const handleRerun = async (id: string) => {
    setProcessing(id);
    try {
      await fetchApi(`/api/runs/${id}/rerun`, { method: "POST" });
      alert("Run re-processed successfully.");
    } catch (e) {
      alert("Error rerunning run: " + e);
    } finally {
      setProcessing(null);
    }
  };

  return (
    <main className="fade-in-up space-y-6 min-w-0">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-zinc-50/85 backdrop-blur-md border-b border-zinc-200/70 flex flex-wrap items-center justify-between gap-3 min-w-0">
        <h1 className="text-xl font-semibold">Runs</h1>
        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="text-zinc-600 shrink-0">Store:</span>
          <select
            className="rounded border px-2 py-1 max-w-[220px] truncate"
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!hasStore ? (
        <div className="rounded border bg-white p-4 text-sm">
          No stores found. Contact your organization admin.
        </div>
      ) : null}
      {error ? (
        <div className="rounded border bg-white p-4 text-sm text-red-700">
          Error: {error}
        </div>
      ) : null}

      <div className="rounded-lg border bg-white overflow-auto">
        <table className="min-w-[900px] w-full text-sm">
          <thead className="border-b bg-zinc-50 text-left">
            <tr>
              <th className="p-3">Business date</th>
              <th className="p-3">Batch #</th>
              <th className="p-3">Status</th>
              <th className="p-3">Files</th>
              <th className="p-3">Created</th>
              {canWrite && <th className="p-3 w-24"></th>}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="border-b last:border-b-0 group">
                <td className="p-3">
                  <Link className="underline" href={`/runs/${r.id}`}>
                    {r.businessDate}
                  </Link>
                </td>
                <td className="p-3 font-mono">{r.batchNo}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      r.status === "COMPLETED"
                        ? "bg-green-100 text-green-700"
                        : r.status === "FAILED"
                          ? "bg-red-100 text-red-700"
                          : "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="p-3">{r.files.length}</td>
                <td className="p-3 text-zinc-500">
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                {canWrite && (
                  <td className="p-3 w-24">
                    <div
                      className={`flex items-center gap-2 transition-opacity ${
                        processing === r.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      {processing === r.id ? (
                        <span className="text-[10px] text-zinc-400 animate-pulse">
                          Wait...
                        </span>
                      ) : (
                        <>
                          <button
                            title="Rerun (uses stored raw data)"
                            onClick={() => handleRerun(r.id)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                              <path d="M21 3v5h-5" />
                              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                              <path d="M3 21v-5h5" />
                            </svg>
                          </button>
                          <button
                            title="Delete Run"
                            onClick={() => handleDelete(r.id)}
                            className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!loading && runs.length === 0 ? (
              <tr>
                <td
                  className="p-3 text-sm text-zinc-500"
                  colSpan={canWrite ? 6 : 5}
                >
                  No runs yet.
                </td>
              </tr>
            ) : null}
            {loading ? (
              <tr>
                <td
                  className="p-3 text-sm text-zinc-500"
                  colSpan={canWrite ? 6 : 5}
                >
                  Loading...
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </main>
  );
}
