"use client";

import { useActionState, useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { cancelJoinRequestAction, createJoinRequestAction } from "@/actions/join-requests";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { submitKeepingValues } from "@/lib/form-submit";
import type { JoinOptions } from "@/domain/join-requests";

type ActionState = { message: string; success: boolean };
type Community = JoinOptions["communities"][number];
type JoinRequestRow = JoinOptions["requests"][number];

// Toasting here rather than in an effect: a successful request revalidates the page and this
// form unmounts in the same commit, so an effect on the result would never run.
async function submit(prev: ActionState, formData: FormData) {
  const result = await createJoinRequestAction(prev, formData);
  (result.success ? toast.success : toast.error)(result.message);
  return result;
}

export function JoinRequestForm({ options }: { options: JoinOptions }) {
  const t = useTranslations("joinRequests");
  const [communityId, setCommunityId] = useState(options.communities[0]?.id ?? "");
  const community = options.communities.find((c) => c.id === communityId);
  if (!community) return null;
  const latest = options.requests.find((r) => r.communityId === community.id);

  return (
    <div className="space-y-4">
      {options.communities.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="join-community">{t("form.community")}</Label>
          <Select value={communityId} onValueChange={setCommunityId}>
            <SelectTrigger id="join-community" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.communities.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {latest?.status === "PENDING" ? (
        <PendingRequest request={latest} />
      ) : (
        <>
          {latest?.status === "REJECTED" && <RejectedNotice request={latest} />}
          <RequestForm key={community.id} community={community} />
        </>
      )}
    </div>
  );
}

function PendingRequest({ request }: { request: JoinRequestRow }) {
  const t = useTranslations("joinRequests");
  const tk = useTranslations("admin.kind");
  const format = useFormatter();
  const [pending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      const result = await cancelJoinRequestAction(request.id);
      (result.success ? toast.success : toast.error)(result.message);
    });

  return (
    <div className="space-y-3 rounded-lg border p-4 text-sm">
      <div className="space-y-1">
        <p className="font-medium">
          {t("status.pending", { date: format.dateTime(request.createdAt, { dateStyle: "medium" }) })}
        </p>
        <p className="text-muted-foreground">
          {t("status.place", {
            building: request.buildingName,
            apartment: request.apartmentNumber,
            kind: tk(request.kind),
          })}
        </p>
      </div>
      <Button type="button" variant="outline" className="w-full sm:w-fit" disabled={pending} onClick={cancel}>
        {t("status.cancel")}
      </Button>
    </div>
  );
}

function RejectedNotice({ request }: { request: JoinRequestRow }) {
  const t = useTranslations("joinRequests");
  return (
    <div className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm" role="status">
      <p className="font-medium">{t("status.rejected")}</p>
      {request.rejectReason && (
        <p className="break-words text-muted-foreground">{t("status.rejectedReason", { reason: request.rejectReason })}</p>
      )}
    </div>
  );
}

function RequestForm({ community }: { community: Community }) {
  const t = useTranslations("joinRequests");
  const [buildingId, setBuildingId] = useState("");
  const [apartmentId, setApartmentId] = useState("");
  const [kind, setKind] = useState<"OWNER" | "TENANT">("OWNER");
  const [, formAction, pending] = useActionState<ActionState, FormData>(submit, { message: "", success: false });

  const apartments = community.buildings.find((b) => b.id === buildingId)?.apartments ?? [];

  return (
    <form onSubmit={submitKeepingValues(formAction)} className="space-y-4">
      <h2 className="text-lg font-semibold">{t("form.title")}</h2>
      <input type="hidden" name="communityId" value={community.id} />
      <input type="hidden" name="buildingId" value={buildingId} />
      <input type="hidden" name="apartmentId" value={apartmentId} />
      <div className="space-y-2">
        <Label htmlFor="join-building">{t("form.building")}</Label>
        <Select
          value={buildingId}
          onValueChange={(value) => {
            setBuildingId(value);
            setApartmentId("");
          }}
        >
          <SelectTrigger id="join-building" className="w-full">
            <SelectValue placeholder={t("form.buildingPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {community.buildings.map((b) => (
              <SelectItem key={b.id} value={b.id}>
                {b.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="join-apartment">{t("form.apartment")}</Label>
        <Select value={apartmentId} onValueChange={setApartmentId} disabled={!buildingId}>
          <SelectTrigger id="join-apartment" className="w-full">
            <SelectValue placeholder={t("form.apartmentPlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {apartments.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <fieldset className="space-y-1">
        <legend className="mb-1 text-sm font-medium">{t("form.kind")}</legend>
        <div className="flex flex-wrap gap-x-6">
          {(["OWNER", "TENANT"] as const).map((value) => (
            <label key={value} className="flex min-h-9 cursor-pointer items-center gap-2 text-sm">
              <input
                type="radio"
                name="kind"
                value={value}
                checked={kind === value}
                onChange={() => setKind(value)}
                className="h-4 w-4 accent-primary"
              />
              {t(value === "OWNER" ? "form.owner" : "form.tenant")}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="join-note">{t("form.note")}</Label>
        <Textarea id="join-note" name="note" maxLength={500} rows={3} />
      </div>
      <Button type="submit" className="w-full sm:w-fit" disabled={pending || !buildingId || !apartmentId}>
        {t("form.submit")}
      </Button>
    </form>
  );
}
