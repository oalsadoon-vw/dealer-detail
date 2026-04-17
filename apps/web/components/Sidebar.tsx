"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import type { MembershipRole } from "@/lib/types/auth";

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
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M12 3l4 4h-3v7h-2V7H8l4-4zm-7 14h14v2H5v-2z" />
    </svg>
  );
}

function IconStore() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M4 7l8-4 8 4v2H4V7zm2 4h3v8H6v-8zm5 0h2v8h-2v-8zm4 0h3v8h-3v-8zM4 21h16v-2H4v2z" />
    </svg>
  );
}

function IconRuns() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z" />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path fill="currentColor" d="M3 13h8v8H3v-8zm10-10h8v18h-8V3zM3 3h8v8H3V3z" />
    </svg>
  );
}

function IconSignOut() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );
}

function IconChevronDown() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
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

export default function Sidebar({ user }: { user?: SidebarUser }) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState(false);

  const isOrgAdmin = user?.role === "org_admin" || user?.isPlatformAdmin;

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

  const sidebarContent = (
    <aside
      className={cx(
        "flex flex-col h-full border-r border-zinc-800 bg-zinc-950 text-white",
        collapsed ? "w-[72px]" : "w-[260px]",
        "transition-[width] duration-200 ease-out"
      )}
    >
      {/* Header with org context */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-900">
        <div className="flex items-center gap-2 overflow-hidden min-w-0">
          <div className="shrink-0 h-8 w-8 rounded-lg bg-zinc-900 text-white grid place-items-center font-bold border border-zinc-800">
            D
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="font-semibold text-zinc-100 whitespace-nowrap block text-sm">
                DealerDetail
              </span>
              {user?.orgName && (
                <span className="text-[10px] text-zinc-500 truncate block">
                  {user.orgName}
                </span>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className={cx(
            "rounded p-1 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors",
            "hidden md:block"
          )}
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>

      {/* Org switcher (only if multiple orgs, expanded mode) */}
      {!collapsed && hasMultipleOrgs && (
        <div className="px-2 pt-3 pb-1 relative">
          <button
            onClick={() => setOrgDropdownOpen((v) => !v)}
            disabled={switching}
            className="flex w-full items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-900 transition-colors disabled:opacity-50"
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

      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
        {!collapsed && (
          <div className="px-2 mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
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
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-zinc-900 text-white shadow-sm ring-1 ring-inset ring-zinc-800"
                  : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
              )}
              title={collapsed ? item.label : undefined}
            >
              <div
                className={cx(
                  "shrink-0 transition-colors",
                  active ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
                )}
              >
                {item.icon}
              </div>
              {!collapsed && <div>{item.label}</div>}
            </Link>
          );
        })}

        {isOrgAdmin && (
          <>
            {!collapsed && (
              <div className="px-2 mt-4 mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Admin
              </div>
            )}
            <Link
              href="/settings"
              className={cx(
                "group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive("/settings")
                  ? "bg-zinc-900 text-white shadow-sm ring-1 ring-inset ring-zinc-800"
                  : "text-zinc-400 hover:bg-zinc-900/50 hover:text-zinc-200"
              )}
              title={collapsed ? "Settings" : undefined}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              {!collapsed && <div>Settings</div>}
            </Link>
          </>
        )}

        {user?.isPlatformAdmin && !collapsed && (
          <>
            <div className="px-2 mt-4 mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Platform
            </div>
            <Link
              href="/admin"
              className="group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-red-400/80 hover:bg-red-950/30 hover:text-red-300 transition-colors"
            >
              <div className="h-5 w-5 rounded bg-red-900/50 text-red-400 grid place-items-center text-[10px] font-bold shrink-0">
                SA
              </div>
              <div>Admin Portal</div>
            </Link>
          </>
        )}
        {user?.isPlatformAdmin && collapsed && (
          <Link
            href="/admin"
            title="Admin Portal"
            className="flex items-center justify-center mt-2"
          >
            <div className="h-7 w-7 rounded bg-red-900/50 text-red-400 grid place-items-center text-[10px] font-bold hover:bg-red-900/70 transition-colors">
              SA
            </div>
          </Link>
        )}
      </nav>

      {/* User footer */}
      <div className="p-4 border-t border-zinc-900">
        {!collapsed ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 shrink-0 rounded-full bg-zinc-800 grid place-items-center text-xs text-zinc-400 font-medium">
                {initials}
              </div>
              <div className="text-xs text-zinc-500 truncate min-w-0">
                <div className="text-zinc-300 font-medium truncate">{displayName}</div>
                <div className="truncate">
                  {displayEmail}
                  {user?.role && (
                    <span className="ml-1 text-zinc-600">
                      &middot; {ROLE_LABEL[user.role] ?? user.role}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition-colors disabled:opacity-50"
            >
              <IconSignOut />
              {signingOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            title="Sign out"
            className="h-8 w-8 mx-auto rounded-full bg-zinc-800 grid place-items-center text-xs text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <IconSignOut />
          </button>
        )}
      </div>
    </aside>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="md:hidden flex h-14 items-center justify-between border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-zinc-900 text-white grid place-items-center font-bold">
            D
          </div>
          <div>
            <div className="font-semibold text-zinc-900 text-sm">DealerDetail</div>
            {user?.orgName && (
              <div className="text-[10px] text-zinc-500">{user.orgName}</div>
            )}
          </div>
        </div>
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm text-zinc-600 hover:bg-zinc-50"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
        >
          Menu
        </button>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:block h-full sticky top-0 self-start max-h-screen overflow-hidden">
        {sidebarContent}
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-zinc-900/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-[280px] bg-zinc-950 shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
}
