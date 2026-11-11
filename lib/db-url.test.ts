import { describe, expect, it } from "vitest";
import { withConnectionLimit } from "@/lib/db-url";

describe("withConnectionLimit", () => {
  it("adds connection_limit when missing, keeping other params", () => {
    expect(withConnectionLimit("postgresql://u:p@127.0.0.1:5433/quattro?sslmode=disable", 1)).toBe(
      "postgresql://u:p@127.0.0.1:5433/quattro?sslmode=disable&connection_limit=1",
    );
    expect(withConnectionLimit("postgresql://u:p@host/db", 5)).toBe("postgresql://u:p@host/db?connection_limit=5");
  });

  it("respects a limit already set in the URL", () => {
    expect(withConnectionLimit("postgresql://h/db?connection_limit=3", 1)).toBe("postgresql://h/db?connection_limit=3");
  });

  it("passes through a missing URL", () => {
    expect(withConnectionLimit(undefined, 1)).toBeUndefined();
  });
});
