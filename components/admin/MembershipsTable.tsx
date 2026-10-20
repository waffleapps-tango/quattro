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
import { Users } from "lucide-react";
import { EmptyState } from "@/components/system/EmptyState";
import { toast } from "sonner";
import { updateMembershipRoleAction, removeMembershipAction } from "@/actions/memberships";
import { useTranslations } from "next-intl";
import { Role, type Membership, type User, type Building, type Apartment } from "@/lib/generated/prisma";

type MembershipRow = Membership & {
  user: User;
  building: Building | null;
  apartment: Apartment | null;
};

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
      <Table>
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
              <TableCell>{membership.apartment?.number ?? "—"}</TableCell>
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
