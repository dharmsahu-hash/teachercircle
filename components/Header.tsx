import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { pg } from "@/lib/db";
import { SUBSCRIPTION_UI_ENABLED } from "@/lib/featureToggles";
import Avatar from "./Avatar";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { SearchIcon, BookIcon, ShieldIcon, InfoIcon, BellIcon } from "./icons";

export default async function Header() {
  const user = await getSessionUser().catch(() => null);
  const hasUnread = user
    ? Boolean(
        (await pg(`/conversation_thread?select=conversation_id&has_unread=eq.true&limit=1`, {
          token: user.token,
        }).catch(() => []))?.length
      )
    : false;

  return (
    <header className="site-header">
      <nav className="nav">
        <Link href="/" className="brand">
          <Logo />
          <span>TeacherCircle</span>
        </Link>
        <div className="links">
          <Link href="/search" className="nav-item">
            <SearchIcon /> <span>Search</span>
          </Link>
          <Link href="/about" className="nav-item">
            <InfoIcon /> <span>About</span>
          </Link>
          {user?.role === "teacher" && (
            <Link href="/teacher/profile" className="nav-item">
              <BookIcon /> <span>My profile</span>
            </Link>
          )}
          {user && (
            <Link href="/messages" className="nav-item nav-item-bell">
              <BellIcon />
              {hasUnread && <span className="unread-dot" aria-label="Unread messages" />}
              <span>Messages</span>
            </Link>
          )}
          {user && (
            <Link href="/favorites" className="nav-item">
              <span aria-hidden>★</span> <span>Saved</span>
            </Link>
          )}
          {SUBSCRIPTION_UI_ENABLED && user?.role === "parent" && (
            <Link href="/billing/subscribe" className="nav-item">Subscribe</Link>
          )}
          {user?.role === "admin" && (
            <Link href="/admin/users" className="nav-item">
              <ShieldIcon /> <span>Admin</span>
            </Link>
          )}
          {user ? (
            <>
              <Link href="/account" className="account-link nav-item">
                <Avatar avatarUrl={user.avatarUrl} avatarSeed={user.avatarSeed} label={user.fullName ?? user.email} />
                <span>{user.fullName ?? "Account"}</span>
              </Link>
              <form action="/api/auth/logout" method="post">
                <button type="submit" className="secondary">Sign out</button>
              </form>
            </>
          ) : (
            <Link href="/login" className="btn">Sign in</Link>
          )}
          <ThemeToggle />
        </div>
      </nav>
    </header>
  );
}
