import type { Metadata } from "next";
import AppShell from "@/components/AppShell";
import ProfileTabs from "@/components/gamify/ProfileTabs";

export const metadata: Metadata = {
  title: "Profile. GOLAZO",
  description: "Your streak, level, and activity feed.",
};

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileTabs />
    </AppShell>
  );
}
