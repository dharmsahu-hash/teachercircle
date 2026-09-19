/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  async headers() {
    // P3 basic security headers. Deliberately no Content-Security-Policy
    // here — this app relies on inline <script type="application/ld+json">
    // (teacher pages) and Next.js's own inline bootstrap scripts, so a real
    // CSP needs per-request nonces to do safely; that's a bigger change than
    // "basic headers" and easy to ship broken (silently breaking the app
    // shell) rather than skip cleanly. No X-XSS-Protection either — it's
    // deprecated and current guidance is to omit it rather than set 0.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
