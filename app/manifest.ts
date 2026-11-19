import type { MetadataRoute } from "next";

// Lets students add the app to their home screen and open it full screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lost and Found",
    short_name: "Lost & Found",
    description: "Tap Lost in a lecture and get back on track in under a minute.",
    start_url: "/home",
    display: "standalone",
    background_color: "#332d7a",
    theme_color: "#332d7a",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
