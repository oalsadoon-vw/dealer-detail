"use client";

import { useMemo, useState } from "react";
import { fetchApi } from "@/lib/client/fetch-api";
import {
  Card,
  CardTitle,
  CardDescription,
  Button,
  FormField,
  Input,
  DataTable,
  type Column,
  EmptyState,
} from "@/components/ui";

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
        <Card>
          <CardTitle>Add a store</CardTitle>
          <CardDescription>
            Add a new dealership location to your organization.
          </CardDescription>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <FormField label="Store name" required>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. BMW of Somewhere"
              />
            </FormField>

            <FormField
              label="Abbreviation"
              helper="Used for filename mapping. Stored uppercase."
            >
              <Input
                value={abbreviation}
                onChange={(e) => setAbbreviation(e.target.value)}
                placeholder="e.g. BST"
              />
            </FormField>

            <FormField label="Timezone">
              <Input
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="e.g. America/Los_Angeles"
              />
            </FormField>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs">
              {error && (
                <span className="text-danger">
                  <strong>Error:</strong> {error}
                </span>
              )}
              {success && <span className="text-success">{success}</span>}
            </div>
            <Button
              variant="primary"
              onClick={createStore}
              disabled={!canSubmit}
              pending={loading}
            >
              {loading ? "Creating..." : "Create store"}
            </Button>
          </div>
        </Card>
      )}

      <DataTable<Store>
        columns={STORE_COLUMNS}
        rows={stores}
        keyField={(s) => s.id}
        initialSort={{ key: "name", dir: "asc" }}
        empty={
          <EmptyState
            title="No stores yet"
            description={
              canCreate
                ? "Create your first store using the form above."
                : "No stores have been added to this organization."
            }
          />
        }
      />
    </div>
  );
}

const STORE_COLUMNS: Column<Store>[] = [
  {
    key: "name",
    header: "Name",
    sortable: true,
    sortValue: (s) => s.name,
    cell: (s) => <span className="font-medium text-fg-strong">{s.name}</span>,
    sticky: true,
  },
  {
    key: "abbreviation",
    header: "Abbreviation",
    sortable: true,
    sortValue: (s) => s.abbreviation ?? "",
    cell: (s) =>
      s.abbreviation ? (
        <span className="font-mono text-fg">{s.abbreviation}</span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  },
  {
    key: "timezone",
    header: "Timezone",
    sortable: true,
    sortValue: (s) => s.timezone ?? "",
    cell: (s) =>
      s.timezone ? (
        <span className="text-fg">{s.timezone}</span>
      ) : (
        <span className="text-fg-subtle">—</span>
      ),
  },
];
