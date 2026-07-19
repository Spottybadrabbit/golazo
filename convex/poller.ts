"use node";
// TxODDS live poller (Node runtime). Self-reschedules: fast (1.5s) while a
// fixture is in-play, slow (45s) when nothing is live, so it stays real-time
// without burning Convex quota or tripping TxODDS rate limits. Writes to
// liveFixtures / liveTicks via internal mutations; the app reads feed.live.

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  fetchFixtures,
  fetchOdds,
  fetchScore,
  isInPlay,
  impliedProbs,
} from "./txline";
import { teamFromName } from "./teams";

const FAST_MS = 1500;
const SLOW_MS = 45_000;
const MAX_FIXTURES = 12; // cap fan-out per poll

export const poll = internalAction({
  args: {},
  handler: async (ctx): Promise<void> => {
    const mode = process.env.TXLINE_MODE ?? "sim";
    if (mode !== "live" || !process.env.TXLINE_API_TOKEN) {
      // Sim mode runs entirely client-side; nothing to poll. Record state and
      // do NOT self-reschedule (the heartbeat cron will re-check periodically).
      await ctx.runMutation(internal.feed.setPollState, { mode: "sim" });
      return;
    }

    let anyInPlay = false;
    let featuredId: number | undefined;
    let engFra: number | undefined;

    try {
      const fixtures = (await fetchFixtures()).slice(0, MAX_FIXTURES);
      const now = Date.now();

      for (const fx of fixtures) {
        const odds = await fetchOdds(fx.fixtureId);
        const score = await fetchScore(fx.fixtureId);
        const inPlay = isInPlay(fx, odds, score);

        const home = teamFromName(fx.homeIsFirst ? fx.home : fx.away);
        const away = teamFromName(fx.homeIsFirst ? fx.away : fx.home);
        const hg = score
          ? fx.homeIsFirst
            ? score.homeGoals
            : score.awayGoals
          : 0;
        const ag = score
          ? fx.homeIsFirst
            ? score.awayGoals
            : score.homeGoals
          : 0;
        const phase = score?.final
          ? "FT"
          : inPlay
            ? "LIVE"
            : fx.gameState === 1
              ? "SCHED"
              : "SCHED";

        await ctx.runMutation(internal.feed.upsertFixture, {
          fixtureId: fx.fixtureId,
          homeCode: home.code,
          homeName: home.name,
          homeFlag: home.flag,
          awayCode: away.code,
          awayName: away.name,
          awayFlag: away.flag,
          homeGoals: hg,
          awayGoals: ag,
          minute: score?.minute ?? undefined,
          statusId: score?.statusId ?? undefined,
          phase,
          inPlay,
          competition: fx.competition,
        });

        if (inPlay && odds) {
          anyInPlay = true;
          // orient odds to the display home/away
          const oHome = fx.homeIsFirst ? odds.home : odds.away;
          const oAway = fx.homeIsFirst ? odds.away : odds.home;
          const p = impliedProbs({ ...odds, home: oHome, away: oAway });
          await ctx.runMutation(internal.feed.appendTick, {
            fixtureId: fx.fixtureId,
            ts: now,
            oddsHome: oHome,
            oddsDraw: odds.draw,
            oddsAway: oAway,
            pHome: p.home,
            pDraw: p.draw,
            pAway: p.away,
          });
          if (featuredId === undefined) featuredId = fx.fixtureId;
          const codes = [home.code, away.code];
          if (codes.includes("ENG") && codes.includes("FRA")) engFra = fx.fixtureId;
        }
      }

      await ctx.runMutation(internal.feed.setPollState, {
        mode: "live",
        featuredFixtureId: engFra ?? featuredId,
        note: anyInPlay ? "in-play" : "no live fixtures",
      });
    } catch (e) {
      await ctx.runMutation(internal.feed.setPollState, {
        mode: "live",
        note: `poll error: ${(e as Error).message}`,
      });
    }

    // self-reschedule at the cadence the current state warrants
    await ctx.scheduler.runAfter(anyInPlay ? FAST_MS : SLOW_MS, internal.poller.poll, {});
  },
});
