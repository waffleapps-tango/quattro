import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { MainNavigation } from "@/components/MainNavigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TopBar } from "@/components/TopBar";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, plPL } from "@clerk/localizations";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return {
    title: { default: "Quattro", template: "%s | Quattro" },
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  return (
    <ClerkProvider localization={locale === "pl" ? plPL : enUS}>
      <html lang={locale} suppressHydrationWarning>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var p=localStorage.getItem("quattro-palette");if(p)document.documentElement.dataset.palette=p}catch(e){}`,
            }}
          />
        </head>
        <body className={inter.className}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <NextIntlClientProvider>
              <div className="flex h-screen">
                <MainNavigation />
                <div className="flex-1 flex flex-col">
                  <TopBar />
                  <main className="flex-1 overflow-y-auto">
                    <div className="mx-auto max-w-[1380px] p-8">
                      {children}
                    </div>
                  </main>
                </div>
              </div>
              <Toaster />
            </NextIntlClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
