"use client";

// Client half of the site header: everything that needs the current path
// (active link), open/closed state (account menu, mobile menu) or a click
// outside to close. Header.tsx stays a server component and passes in the
// signed-in user and links, so no session data is fetched in the browser.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";
import { BellIcon, ChevronDownIcon, CloseIcon, LogOutIcon, MenuIcon } from "./icons";

export type NavLink = { href: string; label: string };
export type HeaderUser = {
  name: string;
  email: string;
  avatarUrl: string | null;
  avatarSeed: string | null;
};

function isActive(pathname: string, href: string) {
  const path = href.split("?")[0];
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`);
}

// Closes a popover on outside click, Escape, and route change.
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  useEffect(() => close(), [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);
  return ref;
}

export function PrimaryNav({ links }: { links: NavLink[] }) {
  const pathname = usePathname();
  return (
    <nav className="primary-nav" aria-label="Main">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`primary-link${isActive(pathname, l.href) ? " active" : ""}`}
          aria-current={isActive(pathname, l.href) ? "page" : undefined}
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

export function MessagesButton({ hasUnread }: { hasUnread: boolean }) {
  const pathname = usePathname();
  return (
    <Link
      href="/messages"
      className={`icon-button${isActive(pathname, "/messages") ? " active" : ""}`}
      aria-label={hasUnread ? "Messages (unread)" : "Messages"}
      title="Messages"
    >
      <BellIcon size={18} />
      {hasUnread && <span className="unread-dot" aria-hidden="true" />}
    </Link>
  );
}

export function AccountMenu({ user, links }: { user: HeaderUser; links: NavLink[] }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  return (
    <div className="account-menu" ref={ref}>
      <button
        type="button"
        className="account-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar avatarUrl={user.avatarUrl} avatarSeed={user.avatarSeed} label={user.name} />
        <span className="account-name">{user.name}</span>
        <ChevronDownIcon />
      </button>
      {open && (
        <div className="menu-panel" role="menu">
          <div className="menu-header">
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
          {links.map((l) => (
            <Link key={l.href} href={l.href} role="menuitem" className="menu-item">
              {l.label}
            </Link>
          ))}
          <form action="/api/auth/logout" method="post">
            <button type="submit" role="menuitem" className="menu-item menu-signout">
              <LogOutIcon /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// Below the desktop breakpoint the primary links and account links move into
// one panel under the header.
export function MobileMenu({
  primary,
  account,
  user,
}: {
  primary: NavLink[];
  account: NavLink[];
  user: HeaderUser | null;
}) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const pathname = usePathname();
  return (
    <div className="mobile-menu" ref={ref}>
      <button
        type="button"
        className="icon-button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? <CloseIcon /> : <MenuIcon />}
      </button>
      {open && (
        <div className="mobile-panel">
          {user && (
            <div className="menu-header">
              <strong>{user.name}</strong>
              <span>{user.email}</span>
            </div>
          )}
          {primary.map((l) => (
            <Link key={l.href} href={l.href} className={`menu-item${isActive(pathname, l.href) ? " active" : ""}`}>
              {l.label}
            </Link>
          ))}
          {account.length > 0 && <div className="menu-divider" />}
          {account.map((l) => (
            <Link key={l.href} href={l.href} className={`menu-item${isActive(pathname, l.href) ? " active" : ""}`}>
              {l.label}
            </Link>
          ))}
          <div className="menu-divider" />
          {user ? (
            <form action="/api/auth/logout" method="post">
              <button type="submit" className="menu-item menu-signout">
                <LogOutIcon /> Sign out
              </button>
            </form>
          ) : (
            <div className="mobile-cta">
              <Link href="/login" className="btn secondary">Sign in</Link>
              <Link href="/login" className="btn">List for free</Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
