import type pl from "./messages/pl.json";

declare module "next-intl" {
  interface AppConfig {
    Locale: "pl" | "en";
    Messages: typeof pl;
  }
}
