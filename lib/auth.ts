import { getAccessToken } from "./session";
import { decodeJwt } from "./jwt";
import { pg } from "./db";

export type Role = "student" | "parent" | "teacher" | "admin" | null;

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  fullName: string | null;
  avatarUrl: string | null;
  avatarSeed: string | null;
  phone: string | null;
  token: string;
};

export class UnauthorizedError extends Error {
  constructor(msg = "Not signed in") {
    super(msg);
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const token = getAccessToken();
  if (!token) return null;

  const claims = decodeJwt(token);
  if (!claims?.sub) return null;
  if (claims.exp && Date.now() / 1000 > claims.exp) return null;

  const rows = await pg(
    `/users?id=eq.${claims.sub}&select=id,email,role,full_name,avatar_url,avatar_seed,phone`,
    { token }
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    role: row.role,
    fullName: row.full_name ?? null,
    avatarUrl: row.avatar_url ?? null,
    avatarSeed: row.avatar_seed ?? null,
    phone: row.phone ?? null,
    token,
  };
}

export async function requireSession(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireSession();
  if (user.role !== "admin") throw new UnauthorizedError("Admin only");
  return user;
}
