import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import { SUBSCRIPTION_UI_ENABLED } from "@/lib/featureToggles";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { AccountMenu, MessagesButton, MobileMenu, PrimaryNav, type HeaderUser, type NavLink } from "./HeaderNav";

const PRIMARY_LINKS: NavLink[] = [
  { href: "/search", label: "Find a teacher" },
  { href: "/tutors", label: "Browse" },
  { href: "/blog", label: "Blog" },
  { href: "/about", label: "About" },
];

export default async function Header() {
  const user = await getSessionUser().catch(() => null);
  const hasUnread = user
    ? Boolean(
        (await pg(`/conversation_thread?select=conversation_id&has_unread=eq.true&limit=1`, {
          token: user.token,
        }).catch(() => []))?.length
      )
    : false;

  // Role-specific links live in the account menu, so the main row stays the
  // same for everyone.
  const accountLinks: NavLink[] = user
    ? [
        { href: "/account", label: "My account" },
        ...(user.role === "teacher" ? [{ href: "/teacher/profile", label: "My teacher profile" }] : []),
        { href: "/messages", label: "Messages" },
        { href: "/favorites", label: "Saved teachers" },
        ...(SUBSCRIPTION_UI_ENABLED && user.role === "parent" ? [{ href: "/billing/subscribe", label: "Subscribe" }] : []),
        ...(user.role === "admin" ? [{ href: "/admin/users", label: "Admin" }] : []),
      ]
    : [];

  const headerUser: HeaderUser | null = user
    ? {
        name: user.fullName ?? user.email.split("@")[0],
        email: user.email,
        avatarUrl: user.avatarUrl ?? null,
        avatarSeed: user.avatarSeed ?? null,
      }
    : null;

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="TeacherCircle home">
          <Logo />
          <span>
            Teacher<span className="brand-accent">Circle</span>
          </span>
        </Link>

        <PrimaryNav links={PRIMARY_LINKS} />

        <div className="header-actions">
          <ThemeToggle />
          {headerUser ? (
            <>
              <MessagesButton hasUnread={hasUnread} />
              <div className="desktop-only">
                <AccountMenu user={headerUser} links={accountLinks} />
              </div>
            </>
          ) : (
            <div className="desktop-only header-cta">
              <Link href="/login" className="btn ghost">Sign in</Link>
              <Link href="/login" className="btn">List for free</Link>
            </div>
          )}
          <div className="mobile-only">
            <MobileMenu primary={PRIMARY_LINKS} account={accountLinks} user={headerUser} />
          </div>
        </div>
      </div>
    </header>
  );
}
