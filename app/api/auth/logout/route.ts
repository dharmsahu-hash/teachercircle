import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/session";

export async function POST() {
  clearSessionCookie();
  return NextResponse.redirect(new URL("/", process.env.APP_HOSTNAME ? `http://${process.env.APP_HOSTNAME}` : "http://localhost:3000"));
}
