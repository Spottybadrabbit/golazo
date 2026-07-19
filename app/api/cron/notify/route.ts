import { NextResponse } from "next/server";
import { getFeed } from "@/lib/feed/adapter";
import { matchSlug } from "@/lib/match";
import { sendTelegramMessage, telegramConfigured } from "@/lib/telegram";
import { convexClient, usersInterestedInRef, markNotifiedRef } from "@/lib/convex-server";
import type { MatchState } from "@/lib/engine";

// Vercel Cron endpoint (see vercel.json). Vercel triggers it with a GET and
// `Authorization: Bearer ${CRON_SECRET}`. For each live match in a notable
// state, it messages every logged-in user who bet on that game or joined its
// sweepstakes AND linked a Telegram chat — deduped so each event fires once.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface InterestedUser {
  clerkId: string;
  chatId: string;
  fixtureId: number;
}

// A short alert for a match's current state, plus a stable dedup key so the
// same event never notifies twice (keyed on the scoreline for goals).
function matchAlert(m: MatchState): { key: string; text: string } | null {
  const label = `${m.home.name} vs ${m.away.name}`;
  const link = `/match/${matchSlug(m)}`;
  const goals = m.score[0] + m.score[1];
  if (m.phase === "LIVE" && m.minute <= 1) {
    return { key: `${m.fixtureId}:KO`, text: `⚽️ *Kick-off!* ${label} is underway.\n${link}` };
  }
  if (m.phase === "HT") {
    return { key: `${m.fixtureId}:HT`, text: `⏸ *Half-time* — ${label} ${m.score[0]}–${m.score[1]}.\n${link}` };
  }
  if (m.phase === "FT") {
    return { key: `${m.fixtureId}:FT`, text: `🏁 *Full-time* — ${label} finished ${m.score[0]}–${m.score[1]}.\n${link}` };
  }
  if (m.phase === "LIVE" && goals > 0) {
    return {
      key: `${m.fixtureId}:GOAL:${m.score[0]}-${m.score[1]}`,
      text: `🥅 *Goal!* ${label} ${m.score[0]}–${m.score[1]} (${m.minute}').\n${link}`,
    };
  }
  return null;
}

export async function GET(req: Request) {
  // Reject anything that isn't the configured cron (when a secret is set).
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!telegramConfigured()) {
    return NextResponse.json({ ok: false, reason: "TELEGRAM_BOT_TOKEN not set" });
  }
  const convex = convexClient();
  if (!convex) {
    return NextResponse.json({ ok: false, reason: "CONVEX_URL / NEXT_PUBLIC_CONVEX_URL not set" });
  }

  const feed = getFeed();
  if (feed.mode === "live" && !feed.ready) {
    return NextResponse.json({ ok: true, sent: 0, note: "live feed not ready" });
  }
  const world = await feed.getWorld();

  // Matches currently worth an alert, keyed by fixtureId.
  const alerts = new Map<number, { key: string; text: string }>();
  for (const m of world.matches) {
    const a = matchAlert(m);
    if (a) alerts.set(m.fixtureId, a);
  }
  if (alerts.size === 0) {
    return NextResponse.json({ ok: true, sent: 0, note: "no notable match states" });
  }

  const fixtureIds = [...alerts.keys()];
  let interested: InterestedUser[] = [];
  try {
    interested = (await convex.query(usersInterestedInRef, { fixtureIds })) as InterestedUser[];
  } catch (err) {
    return NextResponse.json({
      ok: false,
      reason: `convex query failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  let sent = 0;
  let skipped = 0;
  const failures: string[] = [];
  for (const u of interested) {
    const alert = alerts.get(u.fixtureId);
    if (!alert) continue;

    // Dedup: only send if this (user, event) hasn't fired before.
    let fresh = true;
    try {
      fresh = (await convex.mutation(markNotifiedRef, { clerkId: u.clerkId, key: alert.key })) as boolean;
    } catch {
      // If the dedup gate errors, fail open (send once) rather than go silent.
    }
    if (!fresh) {
      skipped++;
      continue;
    }
    const r = await sendTelegramMessage(u.chatId, alert.text);
    if (r.ok) sent++;
    else failures.push(`${u.clerkId}: ${r.error}`);
  }

  return NextResponse.json({
    ok: true,
    fixtures: fixtureIds.length,
    recipients: interested.length,
    sent,
    skipped,
    failures,
  });
}
