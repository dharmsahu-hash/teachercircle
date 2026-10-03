import type { MetadataRoute } from "next";

// Makes the site installable ("Add to Home screen"). On iPhones, push alerts
// only work once the site is installed this way.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TeacherCircle",
    short_name: "TeacherCircle",
    description: "Find trusted teachers and tutors near you, free.",
    start_url: "/daily",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0d6e61",
    icons: [
      { src: "/pwa-icon/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa-icon/512", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
