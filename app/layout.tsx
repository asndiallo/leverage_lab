import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leverage Lab",
  description: "Predictive cash-flow and scenario modeling for real estate.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
