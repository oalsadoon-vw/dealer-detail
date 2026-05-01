"use client";

import { useState } from "react";
import { deleteStoreAction } from "@/lib/server/actions/admin";

export function DeleteStoreButton({
  storeId,
  storeName,
}: {
  storeId: string;
  storeName: string;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const typed = window.prompt(
      `Permanently delete "${storeName}"?\n\nThis cascades through ALL of the store's data: advisors, ingested files, raw report rows, ingestion runs, daily metrics, commodity rows, email sources, and store-level access. This cannot be undone.\n\nType the store name to confirm:`
    );
    if (typed === null) return; // cancelled
    if (typed !== storeName) {
      setError("Confirmation did not match the store name. Nothing was deleted.");
      return;
    }

    setPending(true);
    setError(null);
    const formData = new FormData();
    formData.set("storeId", storeId);
    formData.set("confirm", typed);
    const result = await deleteStoreAction(formData);
    if (!result.ok) {
      setError(result.error);
      setPending(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        className="text-xs text-red-400 hover:text-red-300 transition-colors disabled:opacity-50"
      >
        {pending ? "Deleting..." : "Delete"}
      </button>
      {error && (
        <span className="text-[10px] text-red-400 mt-0.5">{error}</span>
      )}
    </div>
  );
}
