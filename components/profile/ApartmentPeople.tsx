"use client";

import { useActionState, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Illustration } from "@/components/system/Illustration";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { removeResidencyAction } from "@/actions/memberships";
import {
  addTenantAction,
  setPrimaryContactAction,
  updateResidencyPrefsAction,
} from "@/actions/residencies";

type Kind = "OWNER" | "TENANT";
type ActionState = { message: string; success: boolean };

export type PersonView = {
  residencyId: string;
  name: string | null;
  email: string | null;
  kind: Kind;
  isPrimary: boolean;
  receivesPackages: boolean;
  livesHere: boolean;
  isMe: boolean;
};

export type MyLinkView = {
  id: string;
  kind: Kind;
  receivesPackages: boolean;
  livesHereOverride: boolean | null;
  livesHere: boolean;
};

function report(result: ActionState) {
  if (result.success) toast.success(result.message);
  else toast.error(result.message);
}

export function ApartmentPeople({
  apartmentId,
  myLink,
  people,
}: {
  apartmentId: string;
  myLink: MyLinkView;
  people: PersonView[];
}) {
  const t = useTranslations("profile.people");
  const isOwner = myLink.kind === "OWNER";
  const [busy, setBusy] = useState<string | null>(null);
  const [state, formAction, adding] = useActionState<ActionState, FormData>(addTenantAction, {
    message: "",
    success: false,
  });

  useEffect(() => {
    if (state.message) report(state);
  }, [state]);

  const run = async (key: string, fn: () => Promise<ActionState>) => {
    setBusy(key);
    try {
      report(await fn());
    } catch {
      toast.error(t("actionFailed"));
    } finally {
      setBusy(null);
    }
  };

  const hasPrimary = people.some((p) => p.isPrimary);

  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      <h3 className="flex items-center gap-3 text-sm font-medium">
        <Illustration name="residents" size={64} />
        {t("title")}
      </h3>

      <div role="radiogroup" aria-label={t("primary")} className="space-y-4">
      <ul className="space-y-2">
        {people.map((p) => (
          <li key={p.residencyId} className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex flex-wrap items-center gap-2">
              {isOwner && (
                <input
                  type="radio"
                  name={`primary-${apartmentId}`}
                  aria-label={t("makePrimary", { name: p.name ?? t("unnamed") })}
                  checked={p.isPrimary}
                  disabled={busy !== null || !p.receivesPackages}
                  onChange={() => run(`primary-${p.residencyId}`, () => setPrimaryContactAction(apartmentId, p.residencyId))}
                />
              )}
              <span className="font-medium">{p.name ?? t("unnamed")}</span>
              {p.isMe && <span className="text-sm text-muted-foreground">({t("you")})</span>}
              <Badge variant="secondary">{t(`kind.${p.kind}`)}</Badge>
              {p.isPrimary && <Badge>{t("primary")}</Badge>}
              {p.email && p.name !== p.email && (
                <span className="text-sm text-muted-foreground">{p.email}</span>
              )}
            </span>
            {isOwner && p.kind === "TENANT" && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeTenant", { name: p.name ?? t("unnamed") })}
                disabled={busy !== null}
                onClick={() => run(`remove-${p.residencyId}`, () => removeResidencyAction(p.residencyId))}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>

      {isOwner && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            name={`primary-${apartmentId}`}
            checked={!hasPrimary}
            disabled={busy !== null}
            onChange={() => run("primary-none", () => setPrimaryContactAction(apartmentId, null))}
          />
          {t("noPrimary")}
        </label>
      )}
      </div>

      {isOwner && (
        <form action={formAction} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="apartmentId" value={apartmentId} />
          <div className="space-y-1 max-sm:w-full">
            <Label htmlFor={`tenant-email-${apartmentId}`}>{t("tenantEmail")}</Label>
            <Input id={`tenant-email-${apartmentId}`} name="email" type="email" required className="w-full sm:w-64" />
          </div>
          <Button type="submit" disabled={adding}>
            {t("addTenant")}
          </Button>
        </form>
      )}

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id={`notify-${apartmentId}`}
            checked={myLink.receivesPackages}
            disabled={busy !== null}
            onCheckedChange={(checked) =>
              run("notify", () => updateResidencyPrefsAction(myLink.id, { receivesPackages: checked }))
            }
          />
          <Label htmlFor={`notify-${apartmentId}`}>{t("notify")}</Label>
        </div>
        {isOwner && (
          <div className="flex flex-wrap items-center gap-2">
            <Switch
              id={`lives-${apartmentId}`}
              checked={myLink.livesHere}
              disabled={busy !== null}
              onCheckedChange={(checked) =>
                run("lives", () => updateResidencyPrefsAction(myLink.id, { livesHereOverride: checked }))
              }
            />
            <Label htmlFor={`lives-${apartmentId}`}>{t("livesHere")}</Label>
            {myLink.livesHereOverride === null ? (
              <span className="text-sm text-muted-foreground">{t("livesHereAuto")}</span>
            ) : (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0"
                disabled={busy !== null}
                onClick={() => run("lives", () => updateResidencyPrefsAction(myLink.id, { livesHereOverride: null }))}
              >
                {t("livesHereReset")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
