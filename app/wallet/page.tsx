import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import WalletHub from "@/components/wallet/WalletHub";

export const metadata: Metadata = {
  title: "Wallet. GOLAZO",
  description: "Your Solana balance, GOAL points, transaction history, and settings.",
};

export default function WalletPage() {
  return (
    <AppShell>
      <WalletHub />
    </AppShell>
  );
}
