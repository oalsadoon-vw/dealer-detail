import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  Badge,
  Card,
  CardTitle,
  LinkButton,
  SectionHeading,
} from "@/components/ui";
import { MoveStoreControl } from "./move-store-control";
import { DeleteStoreButton } from "./delete-store-button";
import { DeleteOrganizationButton } from "./delete-organization-button";
import { EmailSourcesPanel } from "./email-sources-panel";
import { CancelInviteButton } from "./cancel-invite-button";

export const dynamic = "force-dynamic";

export default async function OrgDetailPage({
  params,
}: {
  params: { orgId: string };
}) {
  const org = await prisma.organization.findUnique({
    where: { id: params.orgId },
  });
  if (!org) notFound();

  const [stores, members, invites, otherOrgs, emailSourcesRaw] =
    await Promise.all([
      prisma.store.findMany({
        where: { organizationId: org.id },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          abbreviation: true,
          timezone: true,
          createdAt: true,
        },
      }),
      prisma.membership.findMany({
        where: { organizationId: org.id },
        include: {
          profile: { select: { email: true, fullName: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      prisma.invite.findMany({
        where: { organizationId: org.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
          invitedBy: { select: { email: true } },
        },
      }),
      prisma.organization.findMany({
        where: { id: { not: org.id } },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      prisma.emailSource.findMany({
        where: { organizationId: org.id },
        orderBy: [{ storeId: "asc" }, { senderEmail: "asc" }],
        select: {
          id: true,
          senderEmail: true,
          subjectPattern: true,
          isActive: true,
          lastProcessedAt: true,
          storeId: true,
          store: { select: { name: true } },
        },
      }),
    ]);

  const emailSources = emailSourcesRaw.map((s) => ({
    id: s.id,
    senderEmail: s.senderEmail,
    subjectPattern: s.subjectPattern,
    isActive: s.isActive,
    lastProcessedAt: s.lastProcessedAt,
    storeId: s.storeId,
    storeName: s.store?.name ?? null,
  }));

  const hasOrgAdmin = members.some((m) => m.role === "org_admin");
  const hasEmailSource = emailSources.some((s) => s.isActive);

  const onboardingComplete =
    hasOrgAdmin && stores.length > 0 && hasEmailSource;

  return (
    <div className="fade-in-up space-y-8 min-w-0">
      {/* Header */}
      <div className="min-w-0">
        <Link
          href="/admin/organizations"
          className="inline-flex items-center text-xs text-fg-muted hover:text-fg-strong transition-colors"
        >
          ← Organizations
        </Link>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-fg-strong truncate">
            {org.name}
          </h1>
          <span className="font-mono text-sm text-fg-muted truncate">
            {org.slug}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {onboardingComplete ? (
            <Badge tone="success" dot>
              Onboarded
            </Badge>
          ) : (
            <Badge tone="warning" dot>
              Setup Incomplete
            </Badge>
          )}
          {!hasOrgAdmin && <Badge tone="danger">No Org Admin</Badge>}
          {stores.length === 0 && <Badge tone="danger">No Stores</Badge>}
          {!hasEmailSource && <Badge tone="danger">No Email Source</Badge>}
        </div>
      </div>

      {/* Onboarding checklist */}
      {!onboardingComplete && (
        <Card variant="default" className="border-warning/30 bg-warning-soft/40">
          <CardTitle className="text-warning">Onboarding Checklist</CardTitle>
          <ul className="mt-3 space-y-2 text-sm">
            <ChecklistItem
              done={stores.length > 0}
              label="Create at least one store"
              actionHref={
                stores.length === 0
                  ? `/admin/organizations/${org.id}/stores/new`
                  : undefined
              }
              actionLabel="Create store"
            />
            <ChecklistItem
              done={hasOrgAdmin}
              label="Invite an organization admin"
              actionHref={
                !hasOrgAdmin
                  ? `/admin/organizations/${org.id}/invites/new`
                  : undefined
              }
              actionLabel="Send invite"
            />
            <ChecklistItem
              done={hasEmailSource}
              label="Configure at least one email source"
              actionLabel={
                hasEmailSource
                  ? undefined
                  : "Use the Email Sources section below"
              }
            />
          </ul>
        </Card>
      )}

      {/* Stores section */}
      <section className="space-y-3">
        <SectionHeading
          title={`Stores (${stores.length})`}
          action={
            <LinkButton
              href={`/admin/organizations/${org.id}/stores/new`}
              variant="secondary"
              size="sm"
            >
              Add Store
            </LinkButton>
          }
        />
        {stores.length > 0 ? (
          <div className="rounded-lg border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-2/60 text-fg-subtle">
                <tr className="border-b border-line">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Abbreviation
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Timezone
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {stores.map((s) => (
                  <tr
                    key={s.id}
                    className="hover:bg-accent-soft/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-fg-strong">
                      {s.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-fg-muted">
                      {s.abbreviation ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {s.timezone ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {s.createdAt.toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-3">
                        <MoveStoreControl
                          storeId={s.id}
                          storeName={s.name}
                          otherOrgs={otherOrgs}
                        />
                        <DeleteStoreButton storeId={s.id} storeName={s.name} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">No stores yet.</p>
        )}
      </section>

      {/* Email sources */}
      <EmailSourcesPanel orgId={org.id} sources={emailSources} />

      {/* Members */}
      <section className="space-y-3">
        <SectionHeading title={`Members (${members.length})`} />
        {members.length > 0 ? (
          <div className="rounded-lg border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-surface-2/60 text-fg-subtle">
                <tr className="border-b border-line">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Joined
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {members.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-accent-soft/40 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-fg-strong">
                      {m.profile.fullName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{m.profile.email}</td>
                    <td className="px-4 py-3">
                      <Badge
                        tone={m.role === "org_admin" ? "success" : "neutral"}
                      >
                        {m.role.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">
                      {m.createdAt.toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">
            No members yet. Invite an org admin to get started.
          </p>
        )}
      </section>

      {/* Invites */}
      <section className="space-y-3">
        <SectionHeading
          title={`Invites (${invites.length})`}
          action={
            <LinkButton
              href={`/admin/organizations/${org.id}/invites/new`}
              variant="secondary"
              size="sm"
            >
              Send Invite
            </LinkButton>
          }
        />
        {invites.length > 0 ? (
          <div className="rounded-lg border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-surface-2/60 text-fg-subtle">
                <tr className="border-b border-line">
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Role
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Sent by
                  </th>
                  <th className="text-left px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Created
                  </th>
                  <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-subtle">
                {invites.map((inv) => {
                  const isPending =
                    !inv.acceptedAt && inv.expiresAt > new Date();
                  const isAccepted = !!inv.acceptedAt;
                  const isExpired =
                    !inv.acceptedAt && inv.expiresAt <= new Date();
                  // Pending and expired invites are still cancellable —
                  // expired rows just clutter the list and admins should be
                  // able to clean them up. Accepted rows are history; they
                  // are gated by `acceptedAt` inside the server action.
                  const canCancel = !isAccepted;
                  return (
                    <tr
                      key={inv.id}
                      className="hover:bg-accent-soft/40 transition-colors"
                    >
                      <td className="px-4 py-3 text-fg-strong">{inv.email}</td>
                      <td className="px-4 py-3">
                        <Badge tone="neutral">
                          {inv.role.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        {isAccepted && <Badge tone="success">Accepted</Badge>}
                        {isPending && <Badge tone="warning">Pending</Badge>}
                        {isExpired && <Badge tone="danger">Expired</Badge>}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">
                        {inv.invitedBy.email}
                      </td>
                      <td className="px-4 py-3 text-fg-muted">
                        {inv.createdAt.toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canCancel ? (
                          <CancelInviteButton
                            inviteId={inv.id}
                            email={inv.email}
                          />
                        ) : (
                          <span className="text-xs text-fg-subtle">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-fg-subtle">No invites sent yet.</p>
        )}
      </section>

      {/* Danger zone */}
      <Card className="border-danger/30 bg-danger-soft/30">
        <CardTitle className="text-danger">Danger zone</CardTitle>
        <p className="mt-1 text-xs text-fg-muted">
          Deleting an organization removes its memberships and invites. Stores
          must be moved or deleted first.
        </p>
        <div className="mt-4">
          <DeleteOrganizationButton
            orgId={org.id}
            orgName={org.name}
            orgSlug={org.slug}
            storeCount={stores.length}
          />
        </div>
      </Card>
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  actionHref,
  actionLabel,
}: {
  done: boolean;
  label: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={
          done
            ? "h-5 w-5 grid place-items-center rounded-full bg-success text-white text-[11px] font-bold"
            : "h-5 w-5 grid place-items-center rounded-full bg-surface-2 text-fg-subtle text-[11px] border border-line"
        }
      >
        {done ? "✓" : "○"}
      </span>
      <span className={done ? "text-fg" : "text-fg-muted"}>{label}</span>
      {actionHref ? (
        <Link
          href={actionHref}
          className="ml-auto text-xs font-medium text-warning hover:text-warning/80 transition-colors"
        >
          {actionLabel} →
        </Link>
      ) : actionLabel ? (
        <span className="ml-auto text-xs text-warning">{actionLabel}</span>
      ) : null}
    </li>
  );
}
