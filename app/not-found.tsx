import Link from "next/link";
import { Button } from "@/components/ui/button";
import { StatusScreen } from "@/components/system/StatusScreen";

export default function NotFound() {
  return (
    <StatusScreen variant="not-found">
      <Button asChild>
        <Link href="/">Wróć na stronę główną</Link>
      </Button>
    </StatusScreen>
  );
}
