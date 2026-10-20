import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "./StatusScreen";

export function AccessDenied() {
  return (
    <StatusScreen variant="forbidden">
      <Button asChild>
        <Link href="/">Wróć na stronę główną</Link>
      </Button>
    </StatusScreen>
  );
}
