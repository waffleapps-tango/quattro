"use client";

import { useState, useTransition } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { approveJoinRequestAction, rejectJoinRequestAction } from "@/actions/join-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/system/EmptyState";
import type { JoinRequestView } from "@/domain/join-requests";

type Kind = "OWNER" | "TENANT";
type Building = { id: string; name: string };
type Apartment = { id: string; number: string };
type Places = { buildings: Building[]; apartmentsByBuilding: Record<string, Apartment[]> };

const who = (r: JoinRequestView) => r.user.name ?? r.user.email;

export function JoinRequestList({
  pending,
  decided,
  buildings,
  apartmentsByBuilding,
}: { pending: JoinRequestView[]; decided: JoinRequestView[] } & Places) {
  const t = useTranslations("admin.requests");

  return (
    <div className="space-y-6">
      {pending.length === 0 ? (
        <EmptyState illustration="doorbell" title={t("empty")} description={t("emptyHint")} />
      ) : (
        <ul className="space-y-3">
          {pending.map((request) => (
            <PendingCard key={request.id} request={request} buildings={buildings} apartmentsByBuilding={apartmentsByBuilding} />
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <details className="rounded-lg border">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
            {t("recent")} ({decided.length})
          </summary>
          <ul className="divide-y border-t">
            {decided.map((request) => (
              <DecidedRow key={request.id} request={request} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Place({ request }: { request: JoinRequestView }) {
  const t = useTranslations("admin");
  return (
    <>
      {request.building.name} / {request.apartment.number} · {t(`kind.${request.kind}`)}
    </>
  );
}

function PendingCard({ request, buildings, apartmentsByBuilding }: { request: JoinRequestView } & Places) {
  const t = useTranslations("admin.requests");
  const format = useFormatter();
  const [busy, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  // Dialogs stay open on failure so the person can fix the input; on success the page
  // revalidates and this card disappears.
  const decide = (run: () => Promise<{ message: string; success: boolean }>, close?: () => void) =>
    startTransition(async () => {
      const result = await run();
      if (result.success) {
        toast.success(result.message);
        close?.();
      } else toast.error(result.message);
    });

  return (
    <li className="space-y-3 rounded-lg border p-4">
      <div className="min-w-0">
        <p className="break-words font-medium">{who(request)}</p>
        {request.user.name && <p className="break-all text-sm text-muted-foreground">{request.user.email}</p>}
        <p className="text-sm text-muted-foreground">
          {t("requestedOn", { date: format.dateTime(request.createdAt, { dateStyle: "medium" }) })}
        </p>
      </div>
      <p className="text-sm">
        <Place request={request} />
      </p>
      {request.note && <p className="whitespace-pre-line break-words text-sm text-muted-foreground">{t("note", { note: request.note })}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => decide(() => approveJoinRequestAction(request.id))}>
          {t("approve")}
        </Button>
        <EditDialog
          request={request}
          buildings={buildings}
          apartmentsByBuilding={apartmentsByBuilding}
          open={editOpen}
          onOpenChange={setEditOpen}
          busy={busy}
          onSubmit={(overrides) =>
            decide(() => approveJoinRequestAction(request.id, overrides), () => setEditOpen(false))
          }
        />
        <RejectDialog
          request={request}
          open={rejectOpen}
          onOpenChange={setRejectOpen}
          busy={busy}
          onSubmit={(reason) =>
            decide(() => rejectJoinRequestAction(request.id, reason), () => setRejectOpen(false))
          }
        />
      </div>
    </li>
  );
}

function EditDialog({
  request,
  buildings,
  apartmentsByBuilding,
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  request: JoinRequestView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (overrides: { buildingId: string; apartmentId: string; kind: Kind }) => void;
} & Places) {
  const t = useTranslations("admin");
  const [buildingId, setBuildingId] = useState(request.building.id);
  const [apartmentId, setApartmentId] = useState(request.apartment.id);
  const [kind, setKind] = useState<Kind>(request.kind);
  const apartments = apartmentsByBuilding[buildingId] ?? [];
  const idPrefix = `edit-${request.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          {t("requests.editAndApprove")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("requests.editTitle")}</DialogTitle>
          <DialogDescription>{t("requests.editDescription", { name: who(request) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-building`}>{t("buildingRequired")}</Label>
            <Select
              value={buildingId}
              onValueChange={(value) => {
                setBuildingId(value);
                setApartmentId("");
              }}
            >
              <SelectTrigger id={`${idPrefix}-building`} className="w-full">
                <SelectValue placeholder={t("none")} />
              </SelectTrigger>
              <SelectContent>
                {buildings.map((building) => (
                  <SelectItem key={building.id} value={building.id}>
                    {building.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-apartment`}>{t("apartmentRequired")}</Label>
            <Select value={apartmentId} onValueChange={setApartmentId}>
              <SelectTrigger id={`${idPrefix}-apartment`} className="w-full">
                <SelectValue placeholder={t("none")} />
              </SelectTrigger>
              <SelectContent>
                {apartments.map((apartment) => (
                  <SelectItem key={apartment.id} value={apartment.id}>
                    {apartment.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-kind`}>{t("kindLabel")}</Label>
            <Select value={kind} onValueChange={(value) => setKind(value as Kind)}>
              <SelectTrigger id={`${idPrefix}-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OWNER">{t("kind.OWNER")}</SelectItem>
                <SelectItem value="TENANT">{t("kind.TENANT")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button type="button" disabled={busy || !apartmentId} onClick={() => onSubmit({ buildingId, apartmentId, kind })}>
            {busy ? t("saving") : t("requests.approve")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RejectDialog({
  request,
  open,
  onOpenChange,
  busy,
  onSubmit,
}: {
  request: JoinRequestView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy: boolean;
  onSubmit: (reason: string | undefined) => void;
}) {
  const t = useTranslations("admin");
  const [reason, setReason] = useState("");
  const reasonId = `reject-${request.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={busy}>
          {t("requests.reject")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("requests.rejectTitle")}</DialogTitle>
          <DialogDescription>{t("requests.rejectDescription", { name: who(request) })}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor={reasonId}>{t("requests.reasonLabel")}</Label>
          <Textarea id={reasonId} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={busy}
            onClick={() => onSubmit(reason.trim() || undefined)}
          >
            {busy ? t("saving") : t("requests.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DecidedRow({ request }: { request: JoinRequestView }) {
  const t = useTranslations("admin.requests");
  const format = useFormatter();
  const approved = request.status === "APPROVED";
  return (
    <li className="flex flex-wrap items-start justify-between gap-2 px-4 py-3">
      <div className="min-w-0 space-y-0.5">
        <p className="break-words text-sm font-medium">{who(request)}</p>
        <p className="text-xs text-muted-foreground">
          <Place request={request} />
          {request.decidedAt && ` · ${format.dateTime(request.decidedAt, { dateStyle: "medium" })}`}
        </p>
        {request.rejectReason && (
          <p className="break-words text-xs text-muted-foreground">{t("reason", { reason: request.rejectReason })}</p>
        )}
      </div>
      <Badge variant={approved ? "default" : "outline"}>{t(`status.${approved ? "APPROVED" : "REJECTED"}`)}</Badge>
    </li>
  );
}
