"use client"

import * as React from "react"
import { CalendarIcon, X } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { enUS, pl } from "date-fns/locale"
import { format } from "date-fns"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const toIso = (d: Date) => format(d, "yyyy-MM-dd")
// "yyyy-MM-dd" -> local date (new Date(iso) would parse as UTC and can shift a day).
const fromIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

// Form-friendly: submits `name` as yyyy-MM-dd (empty string when cleared), like <input type="date">.
export function DatePicker({
  id,
  name,
  defaultValue,
  className,
  "aria-describedby": describedBy,
}: {
  id?: string
  name?: string
  defaultValue?: string
  className?: string
  "aria-describedby"?: string
}) {
  const locale = useLocale()
  const t = useTranslations("common")
  const [open, setOpen] = React.useState(false)
  const [value, setValue] = React.useState(defaultValue ?? "")
  const date = value ? fromIso(value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      {name && <input type="hidden" name={name} value={value} />}
      <div className={cn("relative w-48", className)}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            aria-describedby={describedBy}
            className={cn("w-full justify-start px-3 font-normal", !date && "text-muted-foreground", date && "pr-9")}
          >
            <CalendarIcon className="size-4" />
            <span className="truncate">{date ? format(date, "PPP", { locale: locale === "pl" ? pl : enUS }) : t("pickDate")}</span>
          </Button>
        </PopoverTrigger>
        {date && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("clearDate")}
            className="absolute right-0.5 top-0.5 size-8"
            onClick={() => setValue("")}
          >
            <X className="size-4" />
          </Button>
        )}
      </div>
      <PopoverContent>
        <Calendar
          mode="single"
          locale={locale === "pl" ? pl : enUS}
          weekStartsOn={1}
          selected={date}
          defaultMonth={date}
          onSelect={(d) => {
            setValue(d ? toIso(d) : "")
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
