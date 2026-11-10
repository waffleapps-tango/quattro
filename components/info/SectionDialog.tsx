"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveInfoSectionAction } from "@/actions/info";
import type { SectionWithContacts } from "@/domain/info";

type ActionState = { message: string; success: boolean };
type Row = { id: number; name: string; phone: string; note: string };
let nextRowId = 0;
const newRow = (r: Partial<Row> = {}): Row => ({
  id: nextRowId++,
  name: "",
  phone: "",
  note: "",
  ...r,
});

function SectionForm({
  communityId,
  section,
  onDone,
}: {
  communityId: string;
  section?: SectionWithContacts;
  onDone: () => void;
}) {
  const t = useTranslations("info");
  const [kind, setKind] = useState<"CONTACTS" | "TEXT">(
    section?.kind ?? "CONTACTS",
  );
  const [rows, setRows] = useState<Row[]>(
    section?.contacts.map((c) =>
      newRow({ name: c.name, phone: c.phone, note: c.note ?? "" }),
    ) ?? [newRow()],
  );
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveInfoSectionAction,
    { message: "", success: false },
  );

  const handled = useRef(state);
  useEffect(() => {
    if (pending || state === handled.current || !state.message) return;
    handled.current = state;
    if (state.success) {
      toast.success(state.message);
      onDone();
    } else {
      toast.error(state.message);
    }
  }, [state, pending, onDone]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="communityId" value={communityId} />
      {section && <input type="hidden" name="id" value={section.id} />}
      <input
        type="hidden"
        name="contacts"
        value={JSON.stringify(
          rows.map((r) => ({ name: r.name, phone: r.phone, note: r.note })),
        )}
      />

      <div className="space-y-2">
        <Label htmlFor="info-title">{t("titleLabel")}</Label>
        <Input
          id="info-title"
          name="title"
          defaultValue={section?.title}
          maxLength={100}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="info-kind">{t("kindLabel")}</Label>
        <select
          id="info-kind"
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as "CONTACTS" | "TEXT")}
          className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"
        >
          <option value="CONTACTS">{t("kindContacts")}</option>
          <option value="TEXT">{t("kindText")}</option>
        </select>
      </div>

      {kind === "TEXT" ? (
        <div className="space-y-2">
          <Label htmlFor="info-body">{t("bodyLabel")}</Label>
          <Textarea
            id="info-body"
            name="body"
            defaultValue={section?.body}
            rows={8}
            maxLength={5000}
          />
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, i) => (
            <div
              key={row.id}
              className="grid grid-cols-[1fr_auto] gap-2 rounded-md border p-2"
            >
              <div className="space-y-2">
                <Input
                  aria-label={t("contactName")}
                  placeholder={t("contactName")}
                  value={row.name}
                  maxLength={100}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                />
                <Input
                  aria-label={t("contactPhone")}
                  placeholder={t("contactPhone")}
                  value={row.phone}
                  maxLength={30}
                  inputMode="tel"
                  onChange={(e) => setRow(i, { phone: e.target.value })}
                />
                <Input
                  aria-label={t("contactNote")}
                  placeholder={t("contactNote")}
                  value={row.note}
                  maxLength={200}
                  onChange={(e) => setRow(i, { note: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeContact")}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={rows.length >= 30}
            onClick={() => setRows((rs) => [...rs, newRow()])}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("addContact")}
          </Button>
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {t("cancel")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("saving") : t("save")}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function SectionDialog({
  communityId,
  section,
}: {
  communityId: string;
  section?: SectionWithContacts;
}) {
  const t = useTranslations("info");
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {section ? (
          <Button variant="ghost" size="icon" aria-label={t("edit")}>
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            {t("add")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {section ? t("dialogEditTitle") : t("dialogAddTitle")}
          </DialogTitle>
        </DialogHeader>
        <SectionForm
          communityId={communityId}
          section={section}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
