import type { Metadata } from "next";
import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export const metadata: Metadata = { title: "Rejestracja" };

export default function SignUpPage() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-background p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Załóż konto</h1>
        <p className="text-muted-foreground">
          Zarejestruj się, aby zacząć korzystać z Quattro
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
        Masz już konto?{" "}
        <Link
          href="/sign-in"
          className="text-primary hover:underline"
        >
          Zaloguj się
        </Link>
      </p>
    </div>
  );
} 