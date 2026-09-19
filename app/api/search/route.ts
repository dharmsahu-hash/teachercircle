import { NextRequest, NextResponse } from "next/server";
import { pg } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const subject = searchParams.get("subject")?.trim();
  const city = searchParams.get("city")?.trim();
  const minPrice = searchParams.get("minPrice")?.trim();
  const maxPrice = searchParams.get("maxPrice")?.trim();
  const minRating = searchParams.get("minRating")?.trim();
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 12;

  const filters: string[] = [];
  if (subject) filters.push(`subjects=cs.%7B${encodeURIComponent(subject)}%7D`);
  if (city) filters.push(`city=ilike.*${encodeURIComponent(city)}*`);
  if (minPrice) filters.push(`rate_per_hour=gte.${encodeURIComponent(minPrice)}`);
  if (maxPrice) filters.push(`rate_per_hour=lte.${encodeURIComponent(maxPrice)}`);
  if (minRating) filters.push(`avg_rating=gte.${encodeURIComponent(minRating)}`);
  filters.push("order=avg_rating.desc,review_count.desc");
  filters.push("select=user_id,name,bio,subjects,city,rate_per_hour,experience_years,avg_rating,review_count,is_subscribed,self_attested_at,avg_response_hours,replied_conversation_count");
  filters.push(`limit=${pageSize}`);
  filters.push(`offset=${(page - 1) * pageSize}`);

  const rows = await pg(`/teacher_public?${filters.join("&")}`);
  return NextResponse.json(rows ?? []);
}
