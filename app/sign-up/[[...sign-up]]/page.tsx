import { getTranslations } from "next-intl/server";
import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export async function generateMetadata() {
  const t = await getTranslations("meta");
  return { title: t("signUp") };
}

export default async function SignUpPage() {
  const t = await getTranslations("auth");
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-background p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">{t("signUpTitle")}</h1>
        <p className="text-muted-foreground">
          {t("signUpSubtitle")}
        </p>
      </div>
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            cardBox: "w-full",
            card: "bg-background",
          },
        }}
      />
      <p className="text-sm text-muted-foreground">
        {t("haveAccount")}{" "}
        <Link
          href="/sign-in"
          className="text-primary hover:underline"
        >
          {t("signInLink")}
        </Link>
      </p>
    </div>
  );
} 