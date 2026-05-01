import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drug Leaflet Agent",
  description:
    "Upload drug leaflets and ask questions about dosage, side effects and interactions.",
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
