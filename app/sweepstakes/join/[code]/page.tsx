import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import JoinInvite from "@/components/sweepstakes/JoinInvite";

export const metadata: Metadata = {
  title: "Join a sweepstake. GOLAZO",
  description: "You've been invited to a GOLAZO sweepstakes group — log in to join.",
};

export default async function JoinSweepstakePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <AppShell>
      <JoinInvite code={code} />
    </AppShell>
  );
}
