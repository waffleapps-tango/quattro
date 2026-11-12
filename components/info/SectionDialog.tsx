"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { HeroIllustration } from "@/components/system/Illustration";
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
import { isValidPhone } from "@/lib/text";

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
  const [title, setTitle] = useState(section?.title ?? "");
  const [body, setBody] = useState(section?.body ?? "");
  const [showErrors, setShowErrors] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
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

  const filled = rows.filter((r) => r.name.trim() || r.phone.trim());
  const rowErrors = rows.map((r) => {
    const used = r.name.trim() || r.phone.trim();
    return {
      name: Boolean(used) && !r.name.trim(),
      phone: Boolean(used) && !r.phone.trim(),
      phoneFormat: Boolean(r.phone.trim()) && !isValidPhone(r.phone),
    };
  });
  const errors = {
    title: !title.trim(),
    body: kind === "TEXT" && !body.trim(),
    noContacts: kind === "CONTACTS" && filled.length === 0,
  };
  const invalid =
    errors.title || errors.body || errors.noContacts || rowErrors.some((r) => r.name || r.phone || r.phoneFormat);

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!invalid) return;
    e.preventDefault();
    setShowErrors(true);
    requestAnimationFrame(() =>
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
    );
  };

  const fieldError = (show: boolean, message: string) =>
    showErrors && show ? (
      <p role="alert" className="text-sm text-destructive">
        {message}
      </p>
    ) : null;

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} noValidate className="space-y-4">
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
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={100}
          aria-invalid={showErrors && errors.title}
        />
        {fieldError(errors.title, t("errors.title"))}
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
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
            maxLength={5000}
            aria-invalid={showErrors && errors.body}
          />
          {fieldError(errors.body, t("errors.body"))}
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
                  aria-invalid={showErrors && rowErrors[i].name}
                />
                {fieldError(rowErrors[i].name, t("errors.contactName"))}
                <Input
                  aria-label={t("contactPhone")}
                  placeholder={t("contactPhone")}
                  value={row.phone}
                  maxLength={30}
                  inputMode="tel"
                  onChange={(e) => setRow(i, { phone: e.target.value })}
                  aria-invalid={showErrors && (rowErrors[i].phone || rowErrors[i].phoneFormat)}
                />
                {fieldError(rowErrors[i].phone, t("errors.contactPhone"))}
                {fieldError(rowErrors[i].phoneFormat, t("errors.contactPhoneInvalid"))}
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
          {fieldError(errors.noContacts, t("errors.noContacts"))}
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
        <DialogHeader className="sm:text-center">
          <DialogTitle>
            {section ? t("dialogEditTitle") : t("dialogAddTitle")}
          </DialogTitle>
        </DialogHeader>
        <HeroIllustration name={section?.kind === "TEXT" ? "lease" : "concierge"} />
        <SectionForm
          communityId={communityId}
          section={section}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
