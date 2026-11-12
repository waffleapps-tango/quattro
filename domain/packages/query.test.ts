import { describe, expect, it } from "vitest";
import { parsePackageQuery } from "@/domain/packages/query";

describe("parsePackageQuery", () => {
  it("returns the defaults for no params", () => {
    expect(parsePackageQuery()).toEqual({
      q: "",
      building: "",
      apartment: "",
      recipient: "",
      status: "open",
      sort: "received",
      dir: "desc",
      page: 1,
    });
  });

  it("reads valid params", () => {
    expect(
      parsePackageQuery({
        q: " TRK1 ",
        building: "b1",
        apartment: "20",
        recipient: "jan",
        status: "all",
        sort: "apartment",
        dir: "asc",
        page: "3",
      }),
    ).toEqual({
      q: "TRK1",
      building: "b1",
      apartment: "20",
      recipient: "jan",
      status: "all",
      sort: "apartment",
      dir: "asc",
      page: 3,
    });
  });

  it("falls back to defaults for invalid values", () => {
    const q = parsePackageQuery({ status: "nope", sort: "drop table", dir: "up", page: "-4" });
    expect(q.status).toBe("open");
    expect(q.sort).toBe("received");
    expect(q.dir).toBe("desc");
    expect(q.page).toBe(1);
    expect(parsePackageQuery({ page: "abc" }).page).toBe(1);
  });

  it("takes the first value of a repeated param and caps text length", () => {
    expect(parsePackageQuery({ sort: ["status", "apartment"] }).sort).toBe("status");
    expect(parsePackageQuery({ q: "x".repeat(500) }).q).toHaveLength(100);
  });
});
