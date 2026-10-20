import type { Metadata } from "next";
import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export const metadata: Metadata = { title: "Logowanie" };

export default function SignInPage() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-background p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Witaj ponownie</h1>
        <p className="text-muted-foreground">
          Zaloguj się, aby kontynuować
        </p>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            cardBox: "w-full",
            card: "bg-background",
          },
        }}
      />
      <p className="text-sm text-muted-foreground">
        Nie masz konta?{" "}
        <Link
          href="/sign-up"
          className="text-primary hover:underline"
        >
          Załóż konto
        </Link>
      </p>
    </div>
  );
} 