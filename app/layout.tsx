import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "French Vocabulary + Pronunciation Coach",
  description: "Static scaffold for the second app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
