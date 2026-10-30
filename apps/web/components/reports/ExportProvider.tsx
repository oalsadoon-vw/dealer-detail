"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ExportTable } from "@/lib/client/export";

type ExportCtxValue = {
  tables: ExportTable[];
  register: (t: ExportTable) => void;
  unregister: (id: string) => void;
};

const ExportCtx = createContext<ExportCtxValue | null>(null);

/**
 * Holds the set of tables currently registered by the visible report page, so
 * the shared ExportMenu (in the shell header) can export *every* table on the
 * page without each page owning its own button.
 */
export function ExportProvider({ children }: { children: React.ReactNode }) {
  const [map, setMap] = useState<Record<string, ExportTable>>({});

  const register = useCallback((t: ExportTable) => {
    setMap((m) => ({ ...m, [t.id]: t }));
  }, []);

  const unregister = useCallback((id: string) => {
    setMap((m) => {
      const { [id]: _drop, ...rest } = m;
      return rest;
    });
  }, []);

  const value = useMemo<ExportCtxValue>(
    () => ({ tables: Object.values(map), register, unregister }),
    [map, register, unregister]
  );

  return <ExportCtx.Provider value={value}>{children}</ExportCtx.Provider>;
}

export function useExportTables(): ExportCtxValue {
  const c = useContext(ExportCtx);
  if (!c) throw new Error("useExportTables outside ExportProvider");
  return c;
}

/**
 * Register a table with the export menu. Idempotent across re-renders: the
 * effect only re-runs when `deps` change, and it unregisters on unmount. Pass
 * the live data arrays as `deps` so the exported rows always match what's on
 * screen.
 */
export function useRegisterExportTable(table: ExportTable, deps: unknown[] = []) {
  const { register, unregister } = useExportTables();
  useEffect(() => {
    register(table);
    return () => unregister(table.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}