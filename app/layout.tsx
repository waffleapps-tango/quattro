import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { MainNavigation } from "@/components/MainNavigation";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Quattro",
  description: "Package management system.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen">
          <MainNavigation />
          <main className="flex-1 p-4 md:p-8">
            {children}
          </main>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
