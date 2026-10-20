import { Metadata } from "next";
import { SettingsForm } from "@/components/settings/SettingsForm";

export const metadata: Metadata = {
  title: "Ustawienia",
  description: "Zarządzaj ustawieniami aplikacji",
};

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ustawienia</h1>
        <p className="text-muted-foreground">
          Zarządzaj ustawieniami i preferencjami aplikacji.
        </p>
      </div>
      <SettingsForm />
    </div>
  );
} 