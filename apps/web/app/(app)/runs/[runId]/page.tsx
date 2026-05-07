import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { resolveTenantContext } from "@/lib/server/tenant-context";
import { requireStoreAccess } from "@/lib/server/authz";
import { isAppError } from "@/lib/server/errors";
import {
  Badge,
  Card,
  CardTitle,
  EmptyState,
  SectionHeading,
} from "@/components/ui";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "success" | "danger" | "warning" | "neutral"
> = {
  COMPLETED: "success",
  FAILED: "danger",
  RUNNING: "warning",
  PENDING: "warning",
};

export default async function RunDetailPage({
  params,
}: {
  params: { runId: string };
}) {
  let tc;
  try {
    tc = await resolveTenantContext();
  } catch (err) {
    if (isAppError(err)) redirect("/login");
    throw err;
  }

  const run = await prisma.ingestionRun.findUnique({
    where: { id: params.runId },
    include: { store: true, files: true },
  });

  if (!run)
    return (
      <main className="space-y-6">
        <SectionHeading title="Run" size="page" />
        <Card>
          <EmptyState
            title="Run not found"
            description="This run may have been deleted, or you may have followed a stale link."
          />
        </Card>
      </main>
    );

  try {
    requireStoreAccess(tc, run.storeId);
  } catch {
    return (
      <main className="space-y-6">
        <SectionHeading title="Run" size="page" />
        <Card>
          <EmptyState
            title="No access"
            description="You do not have permission to view this run."
          />
        </Card>
      </main>
    );
  }

  const businessDate = run.businessDate.toISOString().slice(0, 10);
  const tone = STATUS_TONE[run.status] ?? "neutral";

  return (
    <main className="fade-in-up space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          title={`Run · ${businessDate}`}
          description={`Batch #${run.batchNo} · ${run.store.name}`}
          size="page"
        />
        <Link
          href="/runs"
          className="text-sm text-fg-muted underline-offset-2 transition-colors hover:text-fg-strong hover:underline"
        >
          ← Back to runs
        </Link>
      </div>

      <Card>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Store
            </dt>
            <dd className="mt-1 text-fg-strong">{run.store.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Business date
            </dt>
            <dd className="mt-1 text-fg-strong tabular-nums">{businessDate}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Batch #
            </dt>
            <dd className="mt-1 font-mono text-fg-strong tabular-nums">
              {run.batchNo}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-fg-muted">
              Status
            </dt>
            <dd className="mt-1">
              <Badge tone={tone} size="sm">
                {run.status}
              </Badge>
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardTitle className="mb-4">Files</CardTitle>
        {run.files.length === 0 ? (
          <EmptyState
            title="No files"
            description="This run did not include any files."
          />
        ) : (
          <div className="space-y-3">
            {run.files.map((f) => {
              const meta = (f.rawMeta ?? {}) as Record<string, unknown>;
              const headers: string[] = Array.isArray(meta.headers)
                ? meta.headers
                : [];
              const usedSheetName = meta.usedSheetName as string | undefined;
              const rangeStartRow = meta.rangeStartRow as number | undefined;
              const detectNotes: string[] = Array.isArray(meta.detectNotes)
                ? meta.detectNotes
                : [];
              const confidence = Math.round(
                (f.detectionConfidence ?? 0) * 100
              );

              return (
                <div
                  key={f.id}
                  className="rounded-md border border-line-subtle bg-surface-2/40 p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-fg-strong">
                      {f.originalFilename}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge tone="neutral" size="sm">
                        {f.detectedType ?? "unknown"}
                      </Badge>
                      <span className="font-mono text-fg-subtle tabular-nums">
                        {confidence}% match
                      </span>
                    </div>
                  </div>
                  <div className="mt-1.5 text-xs text-fg-subtle">
                    sheet: <span className="font-mono">{usedSheetName ?? "?"}</span>{" "}
                    · headerRowOffset:{" "}
                    <span className="font-mono">{rangeStartRow ?? "?"}</span>
                  </div>
                  {headers.length ? (
                    <div className="mt-3 text-xs">
                      <div className="font-semibold text-fg-muted">Headers</div>
                      <div className="mt-1 break-words font-mono leading-relaxed text-fg">
                        {headers.slice(0, 40).join(" | ")}
                      </div>
                    </div>
                  ) : null}
                  {detectNotes.length ? (
                    <div className="mt-3 text-xs">
                      <div className="font-semibold text-fg-muted">
                        Detector notes
                      </div>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fg">
                        {detectNotes.slice(0, 8).map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="mt-3 text-xs">
                    <a
                      className="text-accent transition-colors hover:text-accent-strong"
                      href={`/api/files/${f.id}/preview?limit=15`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview first 15 rows (raw) →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card>
        <CardTitle className="mb-3">Summary</CardTitle>
        <pre className="max-h-[400px] overflow-auto rounded-md border border-line-subtle bg-surface-2/60 p-3 text-xs leading-relaxed text-fg">
          {JSON.stringify(run.summary ?? {}, null, 2)}
        </pre>
      </Card>
    </main>
  );
}
