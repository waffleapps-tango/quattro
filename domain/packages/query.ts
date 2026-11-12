export const PACKAGE_PAGE_SIZE = 20;
export const PACKAGE_SORTS = ["received", "apartment", "status"] as const;
export type PackageSort = (typeof PACKAGE_SORTS)[number];

export type PackageQuery = {
  q: string;
  building: string;
  apartment: string;
  recipient: string;
  status: "open" | "all";
  sort: PackageSort;
  dir: "asc" | "desc";
  page: number;
};

type RawParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const text = (v: string | string[] | undefined) => (first(v) ?? "").trim().slice(0, 100);

// Single place where untrusted URL params become a PackageQuery.
export function parsePackageQuery(raw: RawParams = {}): PackageQuery {
  const page = Number.parseInt(first(raw.page) ?? "", 10);
  return {
    q: text(raw.q),
    building: text(raw.building),
    apartment: text(raw.apartment),
    recipient: text(raw.recipient),
    status: first(raw.status) === "all" ? "all" : "open",
    sort: PACKAGE_SORTS.find((s) => s === first(raw.sort)) ?? "received",
    dir: first(raw.dir) === "asc" ? "asc" : "desc",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}
