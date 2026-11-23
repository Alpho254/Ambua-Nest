import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ambua Nest Realty Property Management",
  description: "Manage rental plots, tenants, M-Pesa payments, balances and reports for Ambua Nest Realty - Eldoret.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#F7F5F0] text-slate-900 antialiased">{children}</body>
    </html>
  );
}
