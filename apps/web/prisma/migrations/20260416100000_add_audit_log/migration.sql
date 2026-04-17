-- Append-only audit log for sensitive admin actions.
-- Not RLS-gated (only written server-side via Prisma).

CREATE TABLE "AuditLog" (
    "id"             TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId"        TEXT NOT NULL,
    "actorEmail"     TEXT NOT NULL,
    "action"         TEXT NOT NULL,
    "targetType"     TEXT NOT NULL,
    "targetId"       TEXT NOT NULL,
    "organizationId" TEXT,
    "metadata"       JSONB,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");
CREATE INDEX "AuditLog_actorId_idx" ON "AuditLog"("actorId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");

-- Enable RLS with no policies = blocked via PostgREST, writable only via Prisma
ALTER TABLE "AuditLog" ENABLE ROW LEVEL SECURITY;
