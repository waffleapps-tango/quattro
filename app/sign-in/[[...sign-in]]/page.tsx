import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="text-muted-foreground">
          Sign in to your account to continue
        </p>
      </div>
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto w-full max-w-[400px]",
            card: "bg-background",
          },
        }}
      />
      <p className="text-sm text-muted-foreground">
        Don't have an account?{" "}
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