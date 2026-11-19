"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Loader2, X } from "lucide-react";
import { EmptyState } from "@/components/system/EmptyState";
import { HeroIllustration } from "@/components/system/Illustration";
import { toast } from "sonner";
import {
  updateMembershipRoleAction,
  removeMembershipAction,
  removeResidencyAction,
  resendInviteAction,
} from "@/actions/memberships";
import { useTranslations } from "next-intl";
import { Role } from "@/lib/generated/prisma";
import type { listMembershipsForCommunity } from "@/domain/memberships";

type MembershipRow = Awaited<
  ReturnType<typeof listMembershipsForCommunity>
>[number];

export function MembershipsTable({
  memberships,
  filtered = false,
}: {
  memberships: MembershipRow[];
  filtered?: boolean;
}) {
  const t = useTranslations("admin");
  const [pendingId, setPendingId] = useState<string | null>(null);

  const handleRoleChange = async (membershipId: string, newRole: Role) => {
    setPendingId(membershipId);
    const result = await updateMembershipRoleAction(membershipId, newRole);
    setPendingId(null);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleRemove = async (membershipId: string) => {
    setPendingId(membershipId);
    const result = await removeMembershipAction(membershipId);
    setPendingId(null);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleRemoveResidency = async (residencyId: string) => {
    setPendingId(residencyId);
    const result = await removeResidencyAction(residencyId);
    setPendingId(null);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  const handleResend = async (membershipId: string) => {
    setPendingId(membershipId);
    const result = await resendInviteAction(membershipId);
    setPendingId(null);
    if (result.success) toast.success(result.message);
    else toast.error(result.message);
  };

  if (memberships.length === 0) {
    return (
      <EmptyState
        illustration="residents"
        title={filtered ? t("emptyFiltered") : t("empty")}
        description={filtered ? undefined : t("emptyHint")}
      />
    );
  }

  const apartments = (membership: MembershipRow) =>
    membership.user.residencies.length === 0 ? (
      "—"
    ) : (
      <div className="flex flex-wrap gap-1">
        {membership.user.residencies.map((r) => {
          const name = `${r.apartment.building.name} / ${r.apartment.number}`;
          return (
            <span
              key={r.id}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-sm"
            >
              {name} · {t(`kind.${r.kind}`)}
              <button
                type="button"
                aria-label={t("removeApartment", { name })}
                className="p-0.5 rounded-sm text-muted-foreground hover:text-foreground disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                disabled={pendingId === r.id}
                onClick={() => handleRemoveResidency(r.id)}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
      </div>
    );

  const roleSelect = (membership: MembershipRow, className: string) => (
    <div className="flex items-center gap-2">
      <Select
        value={membership.role}
        onValueChange={(value) =>
          handleRoleChange(membership.id, value as Role)
        }
        disabled={pendingId === membership.id}
      >
        <SelectTrigger className={className} aria-label={t("roleLabel")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={Role.RESIDENT}>{t("role.RESIDENT")}</SelectItem>
          <SelectItem value={Role.RECEPTIONIST}>
            {t("role.RECEPTIONIST")}
          </SelectItem>
          <SelectItem value={Role.MANAGER}>{t("role.MANAGER")}</SelectItem>
          <SelectItem value={Role.ADMIN}>{t("role.ADMIN")}</SelectItem>
        </SelectContent>
      </Select>
      {pendingId === membership.id && (
        <Loader2
          className="h-4 w-4 animate-spin text-muted-foreground"
          aria-hidden
        />
      )}
    </div>
  );

  // Placeholder accounts that never signed in: show it, and let the admin (re)send the invite email.
  const pendingBadge = (membership: MembershipRow) =>
    membership.pending && (
      <Badge variant="warm" className="ml-2 align-middle">
        {t("pending")}
      </Badge>
    );

  const resendButton = (membership: MembershipRow) =>
    membership.pending && (
      <Button
        variant="outline"
        size="sm"
        disabled={pendingId === membership.id}
        onClick={() => handleResend(membership.id)}
      >
        {membership.inviteSentAt ? t("resendInvite") : t("sendInvite")}
      </Button>
    );

  // Removing a member drops their community access, so it asks first.
  const removeButton = (membership: MembershipRow) => (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={pendingId === membership.id}
        >
          {t("remove")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader className="sm:text-center">
          <AlertDialogTitle>{t("removeConfirmTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("removeConfirmDescription", { email: membership.user.email })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <HeroIllustration name="trash" />
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => handleRemove(membership.id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("remove")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return (
    <ul className="space-y-3">
      {memberships.map((membership) => (
        <li key={membership.id}>
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0 space-y-2">
                <p className="break-all font-medium">
                  {membership.user.email}
                  {pendingBadge(membership)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {t("colBuilding")}: {membership.building?.name ?? "—"}
                </p>
                <div className="text-sm">{apartments(membership)}</div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {roleSelect(membership, "w-[180px]")}
                {resendButton(membership)}
                {removeButton(membership)}
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
