import { NextRequest, NextResponse } from "next/server";
import { pg } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject")?.trim();
  const city = searchParams.get("city")?.trim();

  const filters: string[] = [];
  if (subject) filters.push(`subjects=cs.%7B${encodeURIComponent(subject)}%7D`);
  if (city) filters.push(`city=ilike.*${encodeURIComponent(city)}*`);
  filters.push("order=avg_rating.desc,review_count.desc");
  filters.push("select=user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed");

  const rows = await pg(`/teacher_public?${filters.join("&")}`);
  return NextResponse.json(rows ?? []);
}
