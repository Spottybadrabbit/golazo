import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import WalletCenter from "@/components/wallet/WalletCenter";

export const metadata: Metadata = {
  title: "Wallet. GOLAZO",
  description: "Your GOLAZO wallet: SOL balance, in-app GOAL economy, earnings ledger.",
};

export default function WalletPage() {
  return (
    <AppShell>
      <h1 className="sr-only">Wallet Center</h1>
      <WalletCenter />
    </AppShell>
  );
}
