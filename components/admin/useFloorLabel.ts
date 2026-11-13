import { useTranslations } from "next-intl";

export function useFloorLabel() {
  const t = useTranslations("admin.floor");
  return (floor: number | null) => (floor === null ? t("none") : floor === 0 ? t("ground") : t("level", { n: floor }));
}
