import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export default async function RunDetailPage({ params }: { params: { runId: string } }) {
  const run = await prisma.ingestionRun.findUnique({
    where: { id: params.runId },
    include: { store: true, files: true }
  });

  if (!run) return <main className="rounded border bg-white p-4 text-sm">Run not found.</main>;

  return (
    <main className="space-y-6">
      <h1 className="text-xl font-semibold">Run</h1>

      <div className="rounded border bg-white p-4 text-sm space-y-1">
        <div>
          <span className="font-medium">Store:</span> {run.store.name}
        </div>
        <div>
          <span className="font-medium">Business date:</span> {run.businessDate.toISOString().slice(0, 10)}
        </div>
        <div>
          <span className="font-medium">Batch #:</span> <span className="font-mono">{run.batchNo}</span>
        </div>
        <div>
          <span className="font-medium">Status:</span> {run.status}
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 font-medium">Files</div>
        <div className="space-y-3">
          {run.files.map((f) => {
            const meta = (f.rawMeta ?? {}) as any;
            const headers: string[] = Array.isArray(meta.headers) ? meta.headers : [];
            const usedSheetName = meta.usedSheetName as string | undefined;
            const rangeStartRow = meta.rangeStartRow as number | undefined;
            const detectNotes: string[] = Array.isArray(meta.detectNotes) ? meta.detectNotes : [];

            return (
              <div key={f.id} className="rounded border p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{f.originalFilename}</div>
                  <div className="font-mono">
                    {f.detectedType ?? "unknown"} ({Math.round((f.detectionConfidence ?? 0) * 100)}%)
                  </div>
                </div>
                <div className="mt-1 text-xs text-zinc-600">
                  sheet: {usedSheetName ?? "?"} | headerRowOffset: {rangeStartRow ?? "?"}
                </div>
                {headers.length ? (
                  <div className="mt-2 text-xs">
                    <div className="font-medium">Headers</div>
                    <div className="mt-1 font-mono whitespace-pre-wrap">{headers.slice(0, 40).join(" | ")}</div>
                  </div>
                ) : null}
                {detectNotes.length ? (
                  <div className="mt-2 text-xs">
                    <div className="font-medium">Detector notes</div>
                    <ul className="list-disc pl-5">
                      {detectNotes.slice(0, 8).map((n, i) => (
                        <li key={i}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="mt-2 text-xs">
                  <a className="underline" href={`/api/files/${f.id}/preview?limit=15`} target="_blank" rel="noreferrer">
                    Preview first 15 rows (raw)
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded border bg-white p-4">
        <div className="mb-2 font-medium">Summary</div>
        <pre className="overflow-auto text-xs">{JSON.stringify(run.summary ?? {}, null, 2)}</pre>
      </div>
    </main>
  );
}


