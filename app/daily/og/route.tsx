import { ImageResponse } from "next/og";
import { levelFromSlug } from "@/lib/dailyQuiz";

// Edge runtime on purpose: it is the recommended home for share images, and
// the Node.js build of the image library builds a broken font path on Windows
// (ERR_INVALID_URL), which crashed local runs.
export const runtime = "edge";

// The picture WhatsApp shows when someone shares a score:
// /daily/og?level=class-7-8&score=4&streak=5. Inputs are validated and
// clamped, and the picture is cached for good per URL, so it costs almost nothing.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const level = levelFromSlug(searchParams.get("level") ?? "");
  const rawScore = Number(searchParams.get("score"));
  const rawStreak = Number(searchParams.get("streak") ?? 0);
  if (!level || !Number.isInteger(rawScore) || rawScore < 0 || rawScore > 5) return new Response("Bad request", { status: 400 });
  const streak = Number.isInteger(rawStreak) && rawStreak >= 0 && rawStreak <= 999 ? rawStreak : 0;

  const dots = Array.from({ length: 5 }, (_, i) => i < rawScore);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#0d6e61", color: "white" }}>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 700 }}>TeacherCircle Daily</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 40, opacity: 0.9 }}>{`Maths quiz · ${level.label}`}</div>
          <div style={{ display: "flex", alignItems: "baseline", marginTop: 8 }}>
            <div style={{ display: "flex", fontSize: 190, fontWeight: 800, lineHeight: 1 }}>{rawScore}</div>
            <div style={{ display: "flex", fontSize: 90, opacity: 0.8, marginLeft: 12 }}>/ 5</div>
          </div>
          <div style={{ display: "flex", marginTop: 20 }}>
            {dots.map((on, i) => (
              <div key={i} style={{ display: "flex", width: 56, height: 56, borderRadius: 28, marginRight: 16, background: on ? "#ffffff" : "rgba(255,255,255,0.25)" }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 38 }}>
          <div style={{ display: "flex" }}>{streak > 1 ? `${streak}-day streak` : "Can you beat me?"}</div>
          <div style={{ display: "flex", opacity: 0.85 }}>Free Maths quiz, new every day</div>
        </div>
      </div>
    ),
    // Next sends a long, immutable Cache-Control for these URLs by itself.
    { width: 1200, height: 630 }
  );
}
