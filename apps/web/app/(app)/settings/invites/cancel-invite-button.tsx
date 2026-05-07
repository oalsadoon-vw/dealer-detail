"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cancelInviteAction } from "@/lib/server/actions/org-admin";

/**
 * Client button to cancel a pending invite from the org-admin
 * settings/invites table. Mirrors the platform-admin variant but uses
 * the org-scoped `cancelInviteAction` so it can only touch invites
 * in the caller's own organization.
 */
export function CancelInviteButton({
  inviteId,
  email,
}: {
  inviteId: string;
  email: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClick() {
    setError(null);
    const ok = window.confirm(
      `Cancel the pending invite for ${email}? They won't be able to use the email link anymore. You can re-invite them immediately afterwards.`
    );
    if (!ok) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("inviteId", inviteId);
      const result = await cancelInviteAction(fd);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        className="text-xs font-medium text-danger underline-offset-2 transition-colors hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isPending ? "Cancelling…" : "Cancel"}
      </button>
      {error ? (
        <span className="text-[10px] text-danger-fg max-w-[200px] text-right">
          {error}
        </span>
      ) : null}
    </div>
  );
}
