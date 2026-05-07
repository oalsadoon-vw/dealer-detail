"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "@/lib/client/fetch-api";
import {
  Badge,
  Card,
  EmptyState,
  SectionHeading,
  Select,
} from "@/components/ui";

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

const STATUS_TONE: Record<string, "success" | "danger" | "warning" | "neutral"> = {
  COMPLETED: "success",
  FAILED: "danger",
  RUNNING: "warning",
  PENDING: "warning",
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
  const [runs, setRuns] = useState<RunRow[]>(initialRuns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasStore = useMemo(() => Boolean(storeId), [storeId]);

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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          title="Runs"
          description="Ingestion history for the selected store. Click a row to view its detail."
          size="page"
        />
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
            Store
          </span>
          <Select
            value={storeId}
            onChange={(e) => setStoreId(e.target.value)}
            className="min-w-[220px] max-w-[280px] truncate"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {!hasStore ? (
        <Card>
          <EmptyState
            title="No stores assigned"
            description="Contact your organization admin to grant access to a store."
          />
        </Card>
      ) : error ? (
        <Card>
          <div className="text-sm text-danger-fg">Error: {error}</div>
        </Card>
      ) : null}

      {hasStore ? (
        <Card padded={false} className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-surface-2/60 text-left text-xs uppercase tracking-wider text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-4 py-3 font-semibold">Business date</th>
                  <th className="px-4 py-3 font-semibold">Batch #</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Files</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  {canWrite && <th className="px-4 py-3 w-28"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="group transition-colors hover:bg-surface-2/40"
                  >
                    <td className="px-4 py-3">
                      <Link
                        className="text-fg-strong tabular-nums underline-offset-4 transition-colors hover:text-accent hover:underline"
                        href={`/runs/${r.id}`}
                      >
                        {r.businessDate}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-fg tabular-nums">
                      {r.batchNo}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={STATUS_TONE[r.status] ?? "neutral"}
                        size="sm"
                      >
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-fg-muted">
                      {r.files.length}
                    </td>
                    <td className="px-4 py-3 text-fg-subtle tabular-nums">
                      {new Date(r.createdAt).toLocaleString()}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 w-28">
                        <div
                          className={`flex items-center gap-1 transition-opacity ${
                            processing === r.id
                              ? "opacity-100"
                              : "opacity-0 group-hover:opacity-100 focus-within:opacity-100"
                          }`}
                        >
                          {processing === r.id ? (
                            <span className="text-[10px] uppercase tracking-wider text-fg-subtle animate-pulse">
                              Working…
                            </span>
                          ) : (
                            <>
                              <button
                                type="button"
                                title="Rerun (uses stored raw data)"
                                onClick={() => handleRerun(r.id)}
                                className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-info-soft hover:text-info-fg focus:outline-none focus:ring-2 focus:ring-accent/30"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="15"
                                  height="15"
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
                                type="button"
                                title="Delete run"
                                onClick={() => handleDelete(r.id)}
                                className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger-fg focus:outline-none focus:ring-2 focus:ring-accent/30"
                              >
                                <svg
                                  xmlns="http://www.w3.org/2000/svg"
                                  width="15"
                                  height="15"
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
                      className="px-4 py-12"
                      colSpan={canWrite ? 6 : 5}
                    >
                      <EmptyState
                        title="No runs yet"
                        description="Upload your first Tekion export to see runs here."
                      />
                    </td>
                  </tr>
                ) : null}
                {loading ? (
                  <tr>
                    <td
                      className="px-4 py-6 text-center text-sm text-fg-subtle"
                      colSpan={canWrite ? 6 : 5}
                    >
                      Loading…
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </main>
  );
}
