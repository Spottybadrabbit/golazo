"use client";

// Fire the player's own settlement once when they open their wallet/profile, so
// bets on matches that have finished pay out instantly without waiting for the
// background sweep. Idempotent + self-scoped (settleMine only grades genuinely
// final fixtures); renders nothing.

import { useEffect, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

export default function SettleGate() {
  const settle = useMutation(api.settlement.settleMine);
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    settle({}).catch(() => {});
  }, [settle]);
  return null;
}
