"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { MembershipRole } from "@/lib/types/auth";
import { BrandMark, BRAND_NAME } from "@/components/BrandMark";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

type OrgOption = {
  id: string;
  name: string;
  slug: string;
};

export type SidebarUser = {
  email: string;
  fullName: string | null;
  orgName: string | null;
  orgSlug: string | null;
  role: MembershipRole | null;
  orgs: OrgOption[];
  isPlatformAdmin?: boolean;
};

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3l4 4h-3v7h-2V7H8l4-4zm-7 14h14v2H5v-2z"
      />
    </svg>
  );
}

function IconRuns() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
      />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 13h8v8H3v-8zm10-10h8v18h-8V3zM3 3h8v8H3V3z"
      />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
      />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
      />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

const ROLE_LABEL: Record<string, string> = {
  org_admin: "Admin",
  store_admin: "Store Admin",
  manager: "Manager",
  viewer: "Viewer",
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

const COLLAPSED_STORAGE_KEY = "sidebar:collapsed";

export default function Sidebar({ user }: { user?: SidebarUser }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [collapsed, setCollapsedState] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const isOrgAdmin = user?.role === "org_admin" || user?.isPlatformAdmin;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored === "1" || stored === "0") {
      setCollapsedState(stored === "1");
    }
  }, []);

  const setCollapsed = (next: boolean) => {
    setCollapsedState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(COLLAPSED_STORAGE_KEY, next ? "1" : "0");
    }
  };

  const items: NavItem[] = useMemo(
    () => [
      { href: "/upload", label: "Upload", icon: <IconUpload /> },
      { href: "/runs", label: "Runs", icon: <IconRuns /> },
      { href: "/dashboard", label: "Dashboard", icon: <IconDashboard /> },
    ],
    []
  );

  useEffect(() => {
    setMobileOpen(false);
    setOrgDropdownOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  async function handleSignOut() {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function handleSwitchOrg(orgId: string) {
    setSwitching(true);
    setOrgDropdownOpen(false);
    try {
      await fetch("/api/auth/set-org", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId: orgId }),
      });
      router.refresh();
    } finally {
      setSwitching(false);
    }
  }

  const displayName = user?.fullName ?? user?.email ?? "User";
  const displayEmail = user?.email ?? "";
  const initials = displayName.charAt(0).toUpperCase();
  const hasMultipleOrgs = (user?.orgs?.length ?? 0) > 1;

  // The desktop sidebar is always dark (graphite rail), regardless of the
  // app's light/dark theme. This is a deliberate Linear-style choice — the
  // sidebar reads as a stable navigation surface that doesn't shift visually
  // when the user toggles the content theme.
  const renderSidebarContent = (isCollapsed: boolean) => (
    <aside
      className={cx(
        "flex flex-col h-full border-r border-zinc-800 bg-zinc-950 text-zinc-200",
        isCollapsed ? "w-[64px]" : "w-[248px]",
        "transition-[width] duration-200 ease-out"
      )}
    >
      {/* Header — brand identity */}
      <div
        className={cx(
          "flex h-14 items-center border-b border-zinc-900",
          isCollapsed ? "justify-center px-2" : "justify-between gap-2 pl-3 pr-2"
        )}
      >
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0">
          <div className="shrink-0">
            <BrandMark size="sm" variant="dark" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <span className="block text-sm font-semibold tracking-tight text-zinc-100 truncate">
                {BRAND_NAME}
              </span>
              {user?.orgName && (
                <span className="block text-[10px] text-zinc-500 truncate">
                  {user.orgName}
                </span>
              )}
            </div>
          )}
        </div>
        {!isCollapsed && (
          <button
            type="button"
            className="hidden lg:flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Expand toggle — own row, only when collapsed (lg+) */}
      {isCollapsed && (
        <div className="hidden lg:flex justify-center border-b border-zinc-900 py-1.5">
          <button
            type="button"
            className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:text-zinc-100 hover:bg-zinc-900 transition-colors"
            onClick={() => setCollapsed(false)}
            aria-label="Expand sidebar"
            title="Expand sidebar"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 5l7 7-7 7M5 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Org switcher (only if multiple orgs, expanded mode) */}
      {!isCollapsed && hasMultipleOrgs && (
        <div className="px-2 pt-3 pb-1 relative">
          <button
            onClick={() => setOrgDropdownOpen((v) => !v)}
            disabled={switching}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 hover:border-zinc-700 transition-colors disabled:opacity-50"
          >
            <span className="truncate">{user?.orgName ?? "Select org"}</span>
            <IconChevronDown />
          </button>
          {orgDropdownOpen && (
            <div className="absolute left-2 right-2 top-full mt-1 z-50 rounded-md border border-zinc-800 bg-zinc-950 shadow-xl py-1 max-h-48 overflow-y-auto">
              {user?.orgs.map((org) => (
                <button
                  key={org.id}
                  onClick={() => handleSwitchOrg(org.id)}
                  className={cx(
                    "flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors",
                    org.slug === user?.orgSlug
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  )}
                >
                  <span className="truncate">{org.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
        {!isCollapsed && (
          <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            Navigation
          </div>
        )}

        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100"
              )}
              title={isCollapsed ? item.label : undefined}
            >
              {/* Active marker — subtle accent bar on the left */}
              {active && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-accent" />
              )}
              <div
                className={cx(
                  "shrink-0 transition-colors",
                  active
                    ? "text-zinc-100"
                    : "text-zinc-500 group-hover:text-zinc-300"
                )}
              >
                {item.icon}
              </div>
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        {isOrgAdmin && (
          <>
            {!isCollapsed && (
              <div className="px-2 mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Admin
              </div>
            )}
            <Link
              href="/settings"
              className={cx(
                "group relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                isActive("/settings")
                  ? "bg-zinc-900 text-white"
                  : "text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100"
              )}
              title={isCollapsed ? "Settings" : undefined}
            >
              {isActive("/settings") && (
                <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-r-full bg-accent" />
              )}
              <IconSettings />
              {!isCollapsed && <span>Settings</span>}
            </Link>
          </>
        )}

        {user?.isPlatformAdmin && !isCollapsed && (
          <>
            <div className="px-2 mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Platform
            </div>
            <Link
              href="/admin"
              className="group flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-rose-400/80 hover:bg-rose-950/40 hover:text-rose-300 transition-colors"
            >
              <div className="h-[18px] w-[18px] grid place-items-center rounded bg-rose-900/50 text-rose-400 text-[9px] font-bold shrink-0">
                SA
              </div>
              <span>Admin Portal</span>
            </Link>
          </>
        )}
        {user?.isPlatformAdmin && isCollapsed && (
          <Link
            href="/admin"
            title="Admin Portal"
            className="mt-2 flex items-center justify-center"
          >
            <div className="h-7 w-7 rounded-md bg-rose-900/50 text-rose-400 grid place-items-center text-[10px] font-bold hover:bg-rose-900/70 transition-colors">
              SA
            </div>
          </Link>
        )}
      </nav>

      {/* User footer */}
      <div className="p-3 border-t border-zinc-900 space-y-2">
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-2.5">
              <div className="h-7 w-7 shrink-0 rounded-full bg-zinc-800 grid place-items-center text-[11px] font-medium text-zinc-300">
                {initials}
              </div>
              <div className="min-w-0 flex-1 text-xs">
                <div className="font-medium text-zinc-200 truncate">
                  {displayName}
                </div>
                <div className="truncate text-zinc-500">
                  {displayEmail}
                  {user?.role && (
                    <span className="ml-1 text-zinc-600">
                      &middot; {ROLE_LABEL[user.role] ?? user.role}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-1">
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors disabled:opacity-50"
              >
                <IconSignOut />
                {signingOut ? "Signing out..." : "Sign out"}
              </button>
              <ThemeToggle className="!text-zinc-500 hover:!text-zinc-100 hover:!bg-zinc-900" />
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <ThemeToggle className="!text-zinc-500 hover:!text-zinc-100 hover:!bg-zinc-900" />
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              title="Sign out"
              className="grid h-7 w-7 place-items-center rounded-md bg-zinc-800 text-xs text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200 transition-colors disabled:opacity-50"
            >
              <IconSignOut />
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile top bar (shown below lg) */}
      <div className="lg:hidden flex h-14 items-center justify-between border-b border-line bg-surface px-4">
        <div className="flex items-center gap-2 min-w-0">
          <BrandMark size="sm" variant="dark" />
          <div className="min-w-0">
            <div className="font-semibold text-sm tracking-tight text-fg-strong truncate">
              {BRAND_NAME}
            </div>
            {user?.orgName && (
              <div className="text-[10px] text-fg-subtle truncate">
                {user.orgName}
              </div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="rounded-md border border-line px-3 py-1.5 text-sm text-fg-muted hover:bg-surface-2 shrink-0"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          Menu
        </button>
      </div>

      {/* Desktop sidebar (lg+) */}
      <div className="hidden lg:block h-full sticky top-0 self-start max-h-screen overflow-hidden">
        {renderSidebarContent(collapsed)}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[260px] bg-zinc-950 shadow-xl">
            {renderSidebarContent(false)}
          </div>
        </div>
      )}
    </>
  );
}
