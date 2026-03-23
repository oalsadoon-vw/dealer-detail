"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: React.ReactNode;
};

function IconUpload() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 3l4 4h-3v7h-2V7H8l4-4zm-7 14h14v2H5v-2z"
      />
    </svg>
  );
}

function IconStore() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 7l8-4 8 4v2H4V7zm2 4h3v8H6v-8zm5 0h2v8h-2v-8zm4 0h3v8h-3v-8zM4 21h16v-2H4v2z"
      />
    </svg>
  );
}

function IconRuns() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h16v2H4v-2z"
      />
    </svg>
  );
}

function IconDashboard() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 13h8v8H3v-8zm10-10h8v18h-8V3zM3 3h8v8H3V3z"
      />
    </svg>
  );
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export default function Sidebar() {
  const pathname = usePathname() ?? "/";
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const items: NavItem[] = useMemo(
    () => [
      { href: "/upload", label: "Upload", short: "Up", icon: <IconUpload /> },
      { href: "/stores", label: "Stores", short: "St", icon: <IconStore /> },
      { href: "/runs", label: "Runs", short: "Ru", icon: <IconRuns /> },
      { href: "/dashboard", label: "Dashboard", short: "Da", icon: <IconDashboard /> }
    ],
    []
  );

  useEffect(() => {
    // Close mobile drawer on route change
    setMobileOpen(false);
  }, [pathname]);

  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const sidebarContent = (
    <aside
      className={cx(
        "flex flex-col h-full border-r border-zinc-800 bg-zinc-950 text-white",
        collapsed ? "w-[72px]" : "w-[260px]",
        "transition-[width] duration-200 ease-out"
      )}
    >
      <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-900">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="shrink-0 h-8 w-8 rounded-lg bg-zinc-900 text-white grid place-items-center font-bold border border-zinc-800">
            D
          </div>
          {!collapsed && (
            <span className="font-semibold text-zinc-100 whitespace-nowrap">
              DealerDetail
            </span>
          )}
        </div>
        <button
          type="button"
          className={cx(
            "rounded p-1 text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors",
            "hidden md:block" // Always visible on desktop if logic requires, but usually tailored
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
              <div className={cx(
                "shrink-0 transition-colors",
                active ? "text-white" : "text-zinc-500 group-hover:text-zinc-300"
              )}>
                {item.icon}
              </div>
              {!collapsed && <div>{item.label}</div>}
            </Link>
          );
        })}
      </nav>

      {/* User / Footer area could go here */}
      <div className="p-4 border-t border-zinc-900">
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-zinc-800 grid place-items-center text-xs text-zinc-400">
              U
            </div>
            <div className="text-xs text-zinc-500">
              <div className="text-zinc-300 font-medium">User Account</div>
              <div>user@example.com</div>
            </div>
          </div>
        ) : (
          <div className="h-8 w-8 mx-auto rounded-full bg-zinc-800 grid place-items-center text-xs text-zinc-400">
            U
          </div>
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
          <div className="font-semibold text-zinc-900">DealerDetail</div>
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
