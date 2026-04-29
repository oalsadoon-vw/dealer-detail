import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fixed Ops Reports — Service Department Performance Intelligence",
  description:
    "Fixed Ops Reports transforms your Tekion data into actionable advisor performance insights. Built for dealership groups that run on metrics.",
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
