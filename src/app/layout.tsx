import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RDC Concrete — Ready-Mix Concrete Solutions Across India",
  description:
    "RDC Concrete (India) Limited — India's leading ready-mix concrete company with 100+ plants. Quality, consistency, and technology-driven concrete solutions.",
  keywords: "ready mix concrete, RMC, RDC Concrete, concrete supplier India, batching plant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
