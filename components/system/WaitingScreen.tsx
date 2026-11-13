import { getTranslations } from "next-intl/server";
import { getCurrentUser } from "@/auth/session";
import { getAppName } from "@/domain/communities/name";
import { getJoinOptions } from "@/domain/join-requests";
import { HeroIllustration } from "./Illustration";
import { JoinRequestForm } from "./JoinRequestForm";
import { WaitingScreenAccount } from "./WaitingScreenAccount";

export async function WaitingScreen() {
  const t = await getTranslations("system.waiting");
  const user = await getCurrentUser();
  const appName = await getAppName();
  const options = user ? await getJoinOptions(user) : null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center gap-8 overflow-y-auto bg-background px-6 py-10">
      <div className="mt-auto flex flex-col items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary font-heading text-xl font-semibold text-primary-foreground shadow-md">
          {appName.charAt(0).toUpperCase()}
        </span>
        <span className="font-heading text-lg font-semibold uppercase tracking-wide">{appName}</span>
      </div>
      <div className="mb-auto flex w-full max-w-[680px] flex-col gap-6 rounded-2xl bg-card p-5 shadow-[0_1px_2px_rgb(9_20_38/0.04),0_8px_32px_rgb(9_20_38/0.06)] sm:p-8">
        <HeroIllustration name="doorbell" priority />
        <div className="flex items-center gap-2 rounded-lg bg-muted px-4 py-3 text-sm">
          <span className="h-2 w-2 rounded-full bg-[#805533]" aria-hidden="true" />
          <span className="font-medium">{t("status")}</span>
          <span className="text-muted-foreground" aria-hidden="true">·</span>
          <span>{t("statusDetail")}</span>
        </div>
        <WaitingScreenAccount>
          <div className="space-y-2">
            <h1 className="text-xl font-semibold">{t("title")}</h1>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
          {options && <JoinRequestForm options={options} />}
        </WaitingScreenAccount>
      </div>
    </div>
  );
}
