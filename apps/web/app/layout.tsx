import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BetterSuno Studio",
  description: "Authorized AI remix studio"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
