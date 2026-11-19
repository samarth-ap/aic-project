import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import "./globals.css";

const sans = Bricolage_Grotesque({ variable: "--font-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Lost and Found",
  description: "Lose the thread in a lecture? Tap once and get back on track in under a minute.",
  appleWebApp: { capable: true, title: "Lost and Found", statusBarStyle: "black-translucent" },
};
// No maximumScale: people must be able to zoom. Inputs are 16px so iOS doesn't auto-zoom on focus.
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#332d7a" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={sans.variable}>{children}</body>
    </html>
  );
}
