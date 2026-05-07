"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { fetchApi } from "@/lib/client/fetch-api";
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
  SectionHeading,
} from "@/components/ui";

type Store = { id: string; name: string };

export default function UploadClient({
  initialStores = [],
}: {
  initialStores?: Store[];
}) {
  const [stores] = useState<Store[]>(initialStores);
  const [storeId, setStoreId] = useState<string>(initialStores[0]?.id ?? "");
  const [businessDate, setBusinessDate] = useState<string>(
    () => new Date().toISOString().slice(0, 10)
  );
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

  const canSubmit = useMemo(
    () => Boolean(storeId && businessDate && files.length),
    [storeId, businessDate, files.length]
  );

  const parsedResult = result as Record<string, unknown> | null;
  const runId = parsedResult?.runId as string | undefined;
  const batchNo = parsedResult?.batchNo as number | undefined;

  async function submit() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const fd = new FormData();
      fd.set("storeId", storeId);
      fd.set("businessDate", businessDate);
      for (const f of files) fd.append("files", f);

      const json = await fetchApi<unknown>("/api/ingest", {
        method: "POST",
        body: fd,
      });
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="fade-in-up space-y-6">
      <SectionHeading
        title="Upload"
        description="Drop in Tekion exports and we'll ingest them into the latest run for the selected store."
        size="page"
      />

      <Card>
        <div className="grid gap-4 md:grid-cols-3">
          <FormField label="Store">
            <Select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField label="Business date">
            <Input
              type="date"
              value={businessDate}
              onChange={(e) => setBusinessDate(e.target.value)}
            />
          </FormField>

          <FormField
            label="Tekion exports"
            helper="Multiple .xlsx files supported"
          >
            <label
              className="group flex h-9 w-full cursor-pointer items-center gap-2 rounded-md border border-dashed border-line bg-surface-2 px-3 text-sm text-fg-muted transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent-fg"
              tabIndex={0}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                className="shrink-0"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M8 2v8m0 0l-3-3m3 3l3-3M3 13h10"
                />
              </svg>
              <span className="truncate">
                {files.length
                  ? `${files.length} file${files.length === 1 ? "" : "s"} selected`
                  : "Choose files"}
              </span>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx"
                className="sr-only"
                onChange={(e) => {
                  const picked = Array.from(e.target.files ?? []);
                  addFiles(picked);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
            </label>
          </FormField>
        </div>

        {files.length ? (
          <div className="mt-4 rounded-md border border-line-subtle bg-surface-2 p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <div className="font-medium text-fg-strong">
                Selected files{" "}
                <span className="text-fg-subtle">({files.length})</span>
              </div>
              <button
                type="button"
                onClick={() => setFiles([])}
                disabled={loading}
                className="text-xs text-fg-muted underline-offset-2 transition-colors hover:text-fg-strong hover:underline disabled:opacity-50"
              >
                Clear all
              </button>
            </div>
            <ul className="space-y-1.5">
              {files.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 truncate">
                    <span className="text-fg-strong">{f.name}</span>{" "}
                    <span className="text-xs text-fg-subtle tabular-nums">
                      ({Math.round(f.size / 1024)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFiles(files.filter((_, i) => i !== idx))}
                    disabled={loading}
                    className="text-xs text-fg-muted underline-offset-2 transition-colors hover:text-danger disabled:opacity-50"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-4 flex items-center gap-3">
          <Button
            onClick={submit}
            disabled={!canSubmit}
            pending={loading}
            variant="primary"
          >
            {loading ? "Ingesting…" : "Ingest"}
          </Button>
          {error ? (
            <span className="text-sm text-danger-fg">Error: {error}</span>
          ) : null}
        </div>
      </Card>

      {result ? (
        <Card>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-sm font-semibold text-fg-strong">
              Run summary
            </div>
            {runId ? (
              <Link
                className="text-sm text-accent transition-colors hover:text-accent-strong"
                href={`/runs/${runId}`}
              >
                View run details →
              </Link>
            ) : null}
          </div>
          {typeof batchNo === "number" ? (
            <div className="mb-3 text-sm text-fg-muted">
              <span className="font-medium text-fg-strong">Batch #</span>{" "}
              <span className="font-mono tabular-nums">{batchNo}</span>
            </div>
          ) : null}
          <pre className="max-h-[320px] overflow-auto rounded-md border border-line-subtle bg-surface-2 p-3 text-xs text-fg leading-relaxed">
            {JSON.stringify(result, null, 2)}
          </pre>
        </Card>
      ) : null}
    </main>
  );
}
