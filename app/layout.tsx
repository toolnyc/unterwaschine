import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ARQ GIF Maker",
  description: "Turn product photos into branded ARQ GIF cards.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
