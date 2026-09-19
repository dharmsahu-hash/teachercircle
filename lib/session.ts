import { cookies } from "next/headers";

const COOKIE_NAME = "tc_session";

export function getAccessToken(): string | null {
  return cookies().get(COOKIE_NAME)?.value ?? null;
}

// Only callable from Route Handlers / Server Actions — Next.js forbids
// writing cookies during a plain Server Component render.
export function setSessionCookie(accessToken: string, expiresInSeconds: number) {
  cookies().set(COOKIE_NAME, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: expiresInSeconds,
  });
}

export function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}
