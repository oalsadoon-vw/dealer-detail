import "./globals.css";
import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "DealerDetail",
  description: "Tekion Excel ingestion + advisor performance metrics"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full">
        <div className="min-h-screen md:grid md:grid-cols-[auto_1fr]">
          <Sidebar />
          <div className="mx-auto w-full max-w-6xl px-4 py-6">{children}</div>
        </div>
      </body>
    </html>
  );
}


