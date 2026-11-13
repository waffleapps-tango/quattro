import type { Metadata } from "next";
import { Geist, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { MainNavigation } from "@/components/MainNavigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TopBar } from "@/components/TopBar";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { ClerkProvider } from "@clerk/nextjs";
import { enUS, plPL } from "@clerk/localizations";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/auth/session";
import { getAppName } from "@/domain/communities/name";
import { AppNameProvider } from "@/components/AppName";
import { IllustrationProvider } from "@/components/system/Illustration";
import { ILLUSTRATIONS_COOKIE, parseIllustrationPref } from "@/components/system/illustration-prefs";

const inter = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-inter" });
const geist = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-geist" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  const appName = await getAppName();
  return {
    title: { default: appName, template: `%s | ${appName}` },
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const [appName, user] = await Promise.all([getAppName(), getCurrentUser()]);
  const illustrations = parseIllustrationPref((await cookies()).get(ILLUSTRATIONS_COOKIE)?.value);
  return (
    <ClerkProvider localization={locale === "pl" ? plPL : enUS}>
      <html lang={locale} suppressHydrationWarning>
        <head>
          <script
            dangerouslySetInnerHTML={{
              __html: `try{var p=localStorage.getItem("quattro-palette");if(p)document.documentElement.dataset.palette=p}catch(e){}`,
            }}
          />
          <noscript>
            <style>{"[style*='opacity:0']{opacity:1!important;transform:none!important}"}</style>
          </noscript>
        </head>
        <body className={`${inter.variable} ${geist.variable} font-sans antialiased`}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <NextIntlClientProvider>
              <IllustrationProvider value={illustrations}>
              <MotionProvider>
                <AppNameProvider value={appName}>
                  {user ? (
                    <div className="flex h-screen">
                      <MainNavigation />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <TopBar />
                        <main className="flex-1 overflow-y-auto">
                          <div className="mx-auto max-w-[1380px] p-4 sm:p-6 lg:p-8">
                            {children}
                          </div>
                        </main>
                      </div>
                    </div>
                  ) : (
                    <main className="min-h-screen">{children}</main>
                  )}
                </AppNameProvider>
                <Toaster />
              </MotionProvider>
              </IllustrationProvider>
            </NextIntlClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
