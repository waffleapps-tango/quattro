import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-background p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-muted-foreground">
          Sign in to your account to continue
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
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="text-primary hover:underline"
        >
          Sign up
        </Link>
      </p>
    </div>
  );
} 