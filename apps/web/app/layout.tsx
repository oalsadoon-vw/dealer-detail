import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DealerDetail — Dealership Performance Intelligence",
  description:
    "DealerDetail transforms your Tekion data into actionable advisor performance insights. Built for dealership groups that run on metrics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="h-full">{children}</body>
    </html>
  );
}
