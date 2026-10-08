import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-y-auto bg-background p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="text-muted-foreground">
          Sign up to get started with Quattro
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
        Already have an account?{" "}
        <Link
          href="/sign-in"
          className="text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
} 