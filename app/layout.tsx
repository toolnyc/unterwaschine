import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Unterwaschine",
  description: "Turn your underwear into a GIF!.",
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
