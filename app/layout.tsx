import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inference Playground",
  description: "Interactive LLM inference serving simulator",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
