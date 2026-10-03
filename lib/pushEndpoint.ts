// A push subscription carries a URL that OUR server will POST to. Left
// unchecked, a signed-in user could point it at an internal address (SSRF), so
// only the real browser push services are accepted. Used both when a device
// registers and again right before sending.
const PUSH_HOST_SUFFIXES = [
  "fcm.googleapis.com", // Chrome, Edge, Brave, Android
  "push.services.mozilla.com", // Firefox
  "push.apple.com", // Safari / iOS home-screen apps (web.push.apple.com)
  "notify.windows.com", // legacy Edge
];

export function isAllowedPushEndpoint(raw: unknown): boolean {
  if (typeof raw !== "string" || raw.length > 600) return false;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "https:" || u.username || u.password) return false;
  if (u.port && u.port !== "443") return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith("." + s));
}
