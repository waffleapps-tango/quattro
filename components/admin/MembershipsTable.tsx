"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Users, X } from "lucide-react";
import { EmptyState } from "@/components/system/EmptyState";
import { toast } from "sonner";
import { updateMembershipRoleAction, removeMembershipAction, removeResidencyAction } from "@/actions/memberships";
import { useTranslations } from "next-intl";
import { Role } from "@/lib/generated/prisma";
import type { listMembershipsForCommunity } from "@/domain/memberships";

type MembershipRow = Awaited<ReturnType<typeof listMembershipsForCommunity>>[number];

export function MembershipsTable({ memberships }: { memberships: MembershipRow[] }) {
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

  if (memberships.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title={t("empty")}
        description={t("emptyHint")}
      />
    );
  }

  return (
    <div className="rounded-md border">
      <Table className="min-w-[680px]">
        <TableHeader>
          <TableRow>
            <TableHead>{t("colEmail")}</TableHead>
            <TableHead>{t("colBuilding")}</TableHead>
            <TableHead>{t("colApartment")}</TableHead>
            <TableHead>{t("colRole")}</TableHead>
            <TableHead>{t("colActions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {memberships.map((membership) => (
            <TableRow key={membership.id}>
              <TableCell>{membership.user.email}</TableCell>
              <TableCell>{membership.building?.name ?? "—"}</TableCell>
              <TableCell>
                {membership.user.residencies.length === 0 ? (
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
                )}
              </TableCell>
              <TableCell>
                <Select
                  value={membership.role}
                  onValueChange={(value) => handleRoleChange(membership.id, value as Role)}
                  disabled={pendingId === membership.id}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={Role.RESIDENT}>{t("role.RESIDENT")}</SelectItem>
                    <SelectItem value={Role.RECEPTIONIST}>{t("role.RECEPTIONIST")}</SelectItem>
                    <SelectItem value={Role.MANAGER}>{t("role.MANAGER")}</SelectItem>
                    <SelectItem value={Role.ADMIN}>{t("role.ADMIN")}</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pendingId === membership.id}
                  onClick={() => handleRemove(membership.id)}
                >
                  {t("remove")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
