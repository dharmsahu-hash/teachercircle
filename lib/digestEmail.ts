// The once-a-day "new requests for you" email. Pure: given what the database
// found, produce subject + HTML. Returns null when there is nothing to say,
// which is how "no activity, no email" is enforced at the last step too.
export type DigestRequest = {
  id: string;
  subject: string;
  city: string | null;
  class: string | null;
  board: string | null;
  exam: string | null;
  mode: string;
  details: string | null;
};
export type DigestRow = { userId: string; email: string; name: string; city: string | null; count: number; requests: DigestRequest[] | null };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function describe(r: DigestRequest): string {
  const bits = [r.class ? `Class ${r.class}` : null, r.exam ? r.exam.toUpperCase() : r.board ? r.board.toUpperCase() : null].filter(Boolean);
  const where = r.mode === "online" ? "Online" : r.city ? (r.mode === "both" ? `${r.city} or online` : r.city) : "Online";
  return [r.subject, ...bits, where].map((x) => esc(String(x))).join(" · ");
}

export function buildDigestEmail(row: DigestRow, baseUrl: string, unsubscribeUrl: string): { subject: string; html: string } | null {
  const reqs = row.requests ?? [];
  if (!row.count || row.count < 1 || reqs.length === 0) return null;
  const first = esc(row.name.split(" ")[0] || "there");
  const subject = row.count === 1 ? "1 new student request near you on TeacherCircle" : `${row.count} new student requests for you on TeacherCircle`;
  const items = reqs
    .map(
      (r) =>
        `<li style="margin:0 0 10px"><a href="${baseUrl}/tutor-requests/${esc(r.id)}" style="color:#1d4ed8;font-weight:600;text-decoration:none">${describe(r)}</a>${
          r.details ? `<br><span style="color:#555">${esc(r.details.slice(0, 120))}${r.details.length > 120 ? "…" : ""}</span>` : ""
        }</li>`
    )
    .join("");
  const more = row.count > reqs.length ? `<p style="margin:0 0 12px">…and ${row.count - reqs.length} more waiting.</p>` : "";
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#222;line-height:1.5">
<p>Hi ${first},</p>
<p>${row.count === 1 ? "A student or parent" : "Students and parents"} looking for your subject posted since your last visit:</p>
<ul style="padding-left:18px">${items}</ul>${more}
<p><a href="${baseUrl}/tutor-requests" style="display:inline-block;background:#1d4ed8;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">See requests and reply</a></p>
<p style="font-size:12px;color:#777;margin-top:24px">You get this only on days with new matching requests. <a href="${esc(unsubscribeUrl)}" style="color:#777">Stop these emails</a>.</p>
</div>`;
  return { subject, html };
}
