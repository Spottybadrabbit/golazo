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

// Featured-fixture preference, applied over every fixture seen this poll:
// live World Cup w/ odds > any World Cup w/ odds > any in-play w/ odds >
// any fixture w/ odds > first fixture. Never a special-cased pair.
interface Candidate {
  fixtureId: number;
  competition: string;
  hasOdds: boolean;
  inPlay: boolean;
}

function pickFeatured(candidates: Candidate[]): number | undefined {
  const isWC = (c: Candidate) => /world cup/i.test(c.competition);
  return (
    candidates.find((c) => isWC(c) && c.hasOdds && c.inPlay)?.fixtureId ??
    candidates.find((c) => isWC(c) && c.hasOdds)?.fixtureId ??
    candidates.find((c) => c.hasOdds && c.inPlay)?.fixtureId ??
    candidates.find((c) => c.hasOdds)?.fixtureId ??
    candidates[0]?.fixtureId
  );
}

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
    const candidates: Candidate[] = [];

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
        const phase = score?.final ? "FT" : inPlay ? "LIVE" : "SCHED";

        // A fixture with 1X2 odds — pre-match or in-play — gets the oriented
        // odds+probs stored on the row and a tick appended, regardless of
        // in-play status (pre-match odds are the whole point of this feed).
        let oHome: number | undefined;
        let oDraw: number | undefined;
        let oAway: number | undefined;
        let pHome: number | undefined;
        let pDraw: number | undefined;
        let pAway: number | undefined;

        if (odds) {
          oHome = fx.homeIsFirst ? odds.home : odds.away;
          oAway = fx.homeIsFirst ? odds.away : odds.home;
          oDraw = odds.draw;
          const p = odds.pct
            ? {
                home: fx.homeIsFirst ? odds.pct.home : odds.pct.away,
                draw: odds.pct.draw,
                away: fx.homeIsFirst ? odds.pct.away : odds.pct.home,
              }
            : impliedProbs({ ...odds, home: oHome, away: oAway });
          pHome = p.home;
          pDraw = p.draw;
          pAway = p.away;

          await ctx.runMutation(internal.feed.appendTick, {
            fixtureId: fx.fixtureId,
            ts: now,
            oddsHome: oHome,
            oddsDraw: oDraw,
            oddsAway: oAway,
            pHome,
            pDraw,
            pAway,
          });
        }

        // Only send the odds/prob fields when we actually have fresh odds this
        // poll. A patch with `oddsHome: undefined` would DELETE the stored odds,
        // so on a transient odds-fetch miss we omit them and keep last-known.
        const upsertArgs: Record<string, unknown> = {
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
          startTime: fx.startTime,
        };
        if (odds) {
          upsertArgs.oddsHome = oHome;
          upsertArgs.oddsDraw = oDraw;
          upsertArgs.oddsAway = oAway;
          upsertArgs.pHome = pHome;
          upsertArgs.pDraw = pDraw;
          upsertArgs.pAway = pAway;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await ctx.runMutation(internal.feed.upsertFixture, upsertArgs as any);

        if (inPlay) anyInPlay = true;
        candidates.push({
          fixtureId: fx.fixtureId,
          competition: fx.competition,
          hasOdds: Boolean(odds),
          inPlay,
        });
      }

      await ctx.runMutation(internal.feed.setPollState, {
        mode: "live",
        featuredFixtureId: pickFeatured(candidates),
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
