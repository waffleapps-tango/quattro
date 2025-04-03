import { Metadata } from "next";
import { SettingsForm } from "@/components/settings/SettingsForm";

export const metadata: Metadata = {
  title: "Settings | Quattro",
  description: "Manage your application settings",
};

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your application settings and preferences.
        </p>
      </div>
      <SettingsForm />
    </div>
  );
} 