import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sun Studio",
  description: "Local web studio for AI image generation — bring your own key.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="mono">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
