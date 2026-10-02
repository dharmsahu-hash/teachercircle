import type { MetadataRoute } from "next";
import { getAppBaseUrl } from "@/lib/url";

// Rendered per request, not once at build time: the sitemap URL must follow
// the live domain setting (APP_HOSTNAME), never whatever the build saw.
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Nothing behind these paths is content a search engine should
        // index — account/admin/messages pages 401/redirect for anyone
        // without a session anyway, and API routes aren't pages at all.
        disallow: ["/api/", "/admin/", "/account", "/messages", "/teacher/profile"],
      },
    ],
    sitemap: `${getAppBaseUrl()}/sitemap.xml`,
  };
}
