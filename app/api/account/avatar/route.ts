import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { pgRpc, PostgrestError, publicErrorMessage } from "@/lib/db";
import { isValidAvatarSeed } from "@/lib/avatar";
import { avatarSchema, parseJsonBody } from "@/lib/validation";

export async function POST(req: NextRequest) {
  const user = await requireSession().catch(() => null);
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const parsed = await parseJsonBody(req, avatarSchema);
  if (!parsed.ok) return parsed.response;
  const seed = parsed.data.seed;
  if (!isValidAvatarSeed(seed)) {
    return NextResponse.json({ error: "Invalid avatar selection" }, { status: 400 });
  }

  try {
    await pgRpc("set_my_avatar_seed", { new_seed: seed }, user.token);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const status = err instanceof PostgrestError ? 400 : 500;
    return NextResponse.json({ error: publicErrorMessage(err, "Could not update avatar") }, { status });
  }
}
