"use client";

import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "./StatusScreen";

export function WaitingScreen() {
  return (
    <StatusScreen variant="waiting">
      <SignOutButton>
        <Button variant="outline">Wyloguj się</Button>
      </SignOutButton>
    </StatusScreen>
  );
}
