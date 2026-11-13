"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Monitor, Moon, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PALETTES, applyPalette, getPalette, type PaletteId } from "@/lib/palettes";
import { useAppName } from "@/components/AppName";
import { centerOf, useThemeSwitch } from "./useThemeSwitch";

const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
const RADIUS = 124;

function MiniApp() {
  const t = useTranslations("settings.mini");
  const appName = useAppName();
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-semibold">{appName}</div>
        <Badge>{t("badge")}</Badge>
      </div>
      <div className="rounded-lg border bg-card p-3 text-card-foreground">
        <div className="text-sm font-medium">{t("package")}</div>
        <div className="text-xs text-muted-foreground">{t("carrier")}</div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
          <div className="h-full w-2/3 rounded-full bg-primary" />
        </div>
      </div>
      <Input placeholder={t("search")} readOnly tabIndex={-1} />
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" tabIndex={-1}>{t("register")}</Button>
        <Button size="sm" variant="secondary" tabIndex={-1}>{t("filter")}</Button>
        <Button size="sm" variant="ghost" tabIndex={-1}>{t("cancel")}</Button>
        <Switch checked className="ml-auto" aria-hidden tabIndex={-1} />
      </div>
    </div>
  );
}

export function ThemePicker() {
  const t = useTranslations("settings");
  const { theme, resolved, set } = useThemeSwitch();
  const modeLabel = t(`themes.${theme as "light" | "dark" | "system"}`);
  const [palette, setPalette] = useState<PaletteId>("default");
  const [hover, setHover] = useState<PaletteId | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setPalette(getPalette());
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const pick = (id: PaletteId) => {
    applyPalette(id);
    setPalette(id);
  };

  const shown = hover ?? palette;
  const label = PALETTES.find((p) => p.id === shown)!.label;
  const Icon = theme === "system" ? Monitor : resolved === "dark" ? Moon : Sun;

  return (
    <div className="grid items-center gap-6 md:grid-cols-[340px_1fr]">
      <div className="mx-auto flex flex-col items-center gap-2">
        <div className="relative size-[272px] sm:size-[340px]">
        <div className="absolute left-0 top-0 size-[340px] origin-top-left max-sm:scale-[0.8]" role="radiogroup" aria-label={t("picker.palette")}>
          <span aria-hidden className="absolute inset-[22px] rounded-full border border-dashed border-border" />
          {PALETTES.map(({ id, label: name, swatch }, i) => {
            const a = (360 / PALETTES.length) * i - 90;
            const on = palette === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={name}
                onClick={() => pick(id)}
                onMouseEnter={() => setHover(id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(id)}
                onBlur={() => setHover(null)}
                className="absolute left-1/2 top-1/2 -ml-[18px] -mt-[18px] size-9 rounded-full transition-transform motion-reduce:transition-none"
                style={{
                  transform: `rotate(${a}deg) translateX(${open ? RADIUS : 0}px) rotate(${-a}deg)`,
                  transitionDuration: "500ms",
                  transitionDelay: `${i * 30}ms`,
                  transitionTimingFunction: EASE_OUT,
                }}
              >
                <span
                  className={cn(
                    "block size-full rounded-full ring-offset-2 ring-offset-background transition-[box-shadow,transform] duration-150",
                    on ? "scale-110 ring-2 ring-foreground" : "ring-1 ring-border [@media(hover:hover)]:hover:scale-110",
                  )}
                  style={{ background: `linear-gradient(135deg, ${swatch[1]} 55%, ${swatch[2]} 55%)` }}
                />
              </button>
            );
          })}
          <button
            type="button"
            aria-label={t("picker.mode", { mode: modeLabel })}
            onClick={(e) =>
              set(theme === "light" ? "dark" : theme === "dark" ? "system" : "light", centerOf(e.currentTarget))
            }
            className="absolute left-1/2 top-1/2 flex size-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-1 rounded-full border bg-card text-card-foreground shadow-md transition-transform duration-150 active:scale-[0.97]"
          >
            <Icon className="size-6" />
            <span className="text-xs text-muted-foreground">{modeLabel}</span>
          </button>
        </div>
        </div>
        <div className="h-5 text-sm font-medium">{label}</div>
      </div>

      <div
        data-palette={shown}
        className="rounded-xl border bg-background p-5 text-foreground shadow-sm transition-colors duration-200 [&_*]:transition-colors [&_*]:duration-200"
      >
        <div className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
          {hover && hover !== palette ? t("picker.preview") : t("picker.current")} · {label}
        </div>
        <MiniApp />
      </div>
    </div>
  );
}
