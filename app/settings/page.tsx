import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import SettingsPanel from "@/components/wallet/SettingsPanel";

export const metadata: Metadata = {
  title: "Settings. GOLAZO",
  description: "Wallet info, SOL + GOAL balances, transaction history, and preferences.",
};

export default function SettingsPage() {
  return (
    <AppShell>
      <SettingsPanel />
    </AppShell>
  );
}
