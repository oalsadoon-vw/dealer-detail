import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * Append-only audit log for sensitive admin actions.
 *
 * Call after a successful mutation, never as a gate.
 * Failures here should not block the action that was already performed.
 */
export async function audit(params: {
  actorId: string;
  actorEmail: string;
  action: string;
  targetType: string;
  targetId: string;
  organizationId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        actorEmail: params.actorEmail,
        action: params.action,
        targetType: params.targetType,
        targetId: params.targetId,
        organizationId: params.organizationId ?? null,
        metadata: params.metadata
          ? (params.metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });
  } catch (e) {
    console.error("[audit] Failed to write audit log:", e);
  }
}
