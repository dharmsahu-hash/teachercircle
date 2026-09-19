import Link from "next/link";
import { getSessionUser } from "@/lib/auth";
import { SUBSCRIPTION_UI_ENABLED } from "@/lib/featureToggles";
import Avatar from "./Avatar";
import Logo from "./Logo";
import { SearchIcon, BookIcon, ShieldIcon, InfoIcon } from "./icons";

export default async function Header() {
  const user = await getSessionUser().catch(() => null);

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
        </div>
      </nav>
    </header>
  );
}
