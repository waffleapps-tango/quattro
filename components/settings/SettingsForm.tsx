"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ThemePicker } from "./ThemePicker";

export function SettingsForm() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [language, setLanguage] = useState("en");

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSave = () => {
    // In a real app, you would save these settings to your backend
    toast.success("Ustawienia zapisane");
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Wygląd</CardTitle>
          <CardDescription>
            Dostosuj wygląd Quattro na swoim urządzeniu
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="theme">Motyw</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Wybierz motyw" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Jasny</SelectItem>
                <SelectItem value="dark">Ciemny</SelectItem>
                <SelectItem value="system">Systemowy</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <ThemePicker />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Powiadomienia</CardTitle>
          <CardDescription>
            Skonfiguruj sposób otrzymywania powiadomień
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="notifications">Powiadomienia e-mail</Label>
            <Switch
              id="notifications"
              checked={notifications}
              onCheckedChange={setNotifications}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Język</CardTitle>
          <CardDescription>
            Wybierz preferowany język
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="language">Język</Label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Wybierz język" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">Angielski</SelectItem>
                <SelectItem value="es">Hiszpański</SelectItem>
                <SelectItem value="fr">Francuski</SelectItem>
                <SelectItem value="de">Niemiecki</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Zapisz zmiany</Button>
      </div>
    </div>
  );
} 