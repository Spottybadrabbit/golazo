"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { BallMark } from "@/components/SiteNav";
import AuthButton from "@/components/AuthButton";
import CodeBlock from "@/components/docs/CodeBlock";
import ArchitectureDiagram from "@/components/docs/ArchitectureDiagram";
import ApiKeyPanel from "@/components/docs/ApiKeyPanel";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "architecture", label: "Architecture" },
  { id: "data-flow", label: "Data Flow" },
  { id: "api-reference", label: "API Reference" },
  { id: "schema", label: "Schema" },
  { id: "api-keys", label: "API Keys" },
  { id: "runbook", label: "Runbook" },
] as const;

export default function DocsPage() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const observed = useRef(new Set<string>());

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => Boolean(el),
    );
    if (!els.length) return;

    const compute = () => {
      // Near the bottom, the last (short) section can never reach the observer
      // band, so force it active — otherwise trailing sections never light up.
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atBottom) {
        setActive(SECTIONS[SECTIONS.length - 1].id);
        return;
      }
      // The topmost currently-visible section wins.
      const visible = SECTIONS.filter((s) => observed.current.has(s.id));
      if (visible.length) setActive(visible[0].id);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) observed.current.add(entry.target.id);
          else observed.current.delete(entry.target.id);
        }
        compute();
      },
      { rootMargin: "-96px 0px -70% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    window.addEventListener("scroll", compute, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", compute);
    };
  }, []);

  return (
    <div className="min-h-dvh floodlight">
      <header className="sticky top-0 z-40 border-b border-line bg-night/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-4">
          <Link href="/" className="flex shrink-0 items-center gap-2">
            <BallMark size={22} />
            <span className="font-extrabold tracking-tight">GOLAZO</span>
            <span className="ml-1 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] text-muted">
              docs
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-3">
            <Link href="/play" className="hidden text-sm text-muted transition-colors hover:text-chalk sm:block">
              Back to app
            </Link>
            <AuthButton />
          </div>
        </div>
      </header>

      <nav className="sticky top-14 z-30 -mx-0 overflow-x-auto border-b border-line bg-night/90 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="flex gap-2">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActive(s.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                active === s.id ? "bg-volt/15 text-volt" : "text-muted hover:bg-surface hover:text-chalk"
              }`}
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      <div className="mx-auto max-w-6xl px-4">
        <div className="grid gap-10 py-8 md:grid-cols-[220px_1fr] md:gap-12">
          <aside className="hidden md:block">
            <nav className="sticky top-24 flex flex-col gap-0.5">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setActive(s.id)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                    active === s.id
                      ? "bg-volt/15 text-volt"
                      : "text-muted hover:bg-surface hover:text-chalk"
                  }`}
                >
                  {s.label}
                </a>
              ))}
            </nav>
          </aside>

          <main className="min-w-0 max-w-3xl pb-24">
            <DocsContent />
          </main>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-28 pb-14">
      <h2 className="mb-4 text-2xl font-extrabold tracking-tight text-chalk sm:text-3xl">
        {title}
      </h2>
      <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-muted">{children}</div>
    </section>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>;
}

function IC({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded border border-line bg-surface px-1.5 py-0.5 font-mono text-[13px] text-volt">
      {children}
    </code>
  );
}

function Callout({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-volt/30 bg-volt/[0.06] px-4 py-3 text-sm text-chalk">
      {children}
    </div>
  );
}

function Table({
  head,
  rows,
}: {
  head: string[];
  rows: (string | React.ReactNode)[][];
}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-surface/60">
            {head.map((h) => (
              <th key={h} className="px-3 py-2.5 font-semibold text-chalk">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-line/60 last:border-0">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2.5 align-top text-muted">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DocsContent() {
  return (
    <>
      <Section id="overview" title="Overview">
        <P>
          GOLAZO is a Next.js 16 (App Router, Turbopack, React 19) World Cup fan app
          built for the Superteam × TxODDS hackathon. Instead of simulating a match
          feed, it <strong className="text-chalk">activates a real TxODDS devnet
          subscription on Solana</strong>, then streams that feed through a
          Convex-backed reactive pipeline into every screen — the Hi-Lo streak game,
          collectible cards, squad sweepstakes, and PunditBot&apos;s commentary.
        </P>
        <Table
          head={["Layer", "Choice"]}
          rows={[
            ["Framework", "Next.js 16, App Router, Turbopack, React 19"],
            ["Styling", "Tailwind v4 — the “volt” design system"],
            ["Realtime store", "Convex (deployment calm-parrot-940)"],
            ["Auth", "Clerk, including a Solana wallet (Web3) sign-in strategy"],
            ["On-chain", <IC key="p">6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J</IC>, ],
            ["Motion", "GSAP + Three.js"],
            ["Hosting", "Vercel (public alias golazowtf.vercel.app)"],
          ]}
        />
        <Callout>
          <strong>Honesty notes:</strong> this is play-money / devnet — no real
          transfers ever occur. The free TxODDS tier exposes a small set of sample
          fixtures (one live World Cup match plus a few friendlies), not the full
          FIFA bracket or a historical archive. In-play score field names are
          self-diagnosing at kickoff — TxODDS&apos; exact in-play shape is only
          confirmed once a tracked match actually starts.
        </Callout>
      </Section>

      <Section id="architecture" title="Architecture">
        <P>
          Four stages: an on-chain activation that mints an API token, a Convex
          poller that keeps the feed fresh, a reactive Convex query the whole UI
          subscribes to, and the app itself — which never fabricates data.
        </P>
        <ArchitectureDiagram />
        <P>
          <strong className="text-chalk">Why two read paths?</strong>{" "}
          <IC>feed.live</IC> (Convex, reactive) and <IC>/api/feed</IC> (a Vercel
          function, polled) both serve the same upstream data. The client prefers
          whichever is live-and-fresher, so the UI never freezes even if Convex is
          unreachable, unconfigured, or the subscription hasn&apos;t delivered yet
          — and the TxLINE API token never reaches the browser in either path.
        </P>
      </Section>

      <Section id="data-flow" title="Data Flow">
        <P>
          <strong className="text-chalk">1. Fixtures.</strong>{" "}
          <IC>GET /api/fixtures/snapshot</IC> lists the fixtures this subscription
          tracks. Each carries a <IC>Participant1IsHome</IC> flag — every
          downstream odds/score field is oriented with it, so &quot;home&quot; means
          the same team throughout the app.
        </P>
        <P>
          <strong className="text-chalk">2. Odds.</strong>{" "}
          <IC>GET /api/odds/snapshot/{"{fixtureId}"}</IC> returns odds records
          across markets/bookmakers. Only <IC>1X2_PARTICIPANT_RESULT</IC>{" "}
          (moneyline) records are used; the <IC>TXLineStablePriceDemargined</IC>{" "}
          bookmaker is preferred, latest by timestamp. Prices are decimal odds ×
          1000 (<IC>2374</IC> → <IC>2.374</IC>). The record&apos;s <IC>Pct</IC>{" "}
          field is an already-de-vigged implied probability (%) — just re-orient
          it to home/away.
        </P>
        <P>
          <strong className="text-chalk">3. Scores.</strong>{" "}
          <IC>GET /api/scores/snapshot/{"{fixtureId}"}</IC> returns score/status
          records; latest by sequence then timestamp wins. Goal/minute field names
          are read defensively (several candidate keys, then a scan, then a
          &quot;1-0&quot; string fallback) — confirmed only once a real match kicks
          off.
        </P>
        <P>
          <strong className="text-chalk">4. Persistence.</strong> The poller
          upserts one row per fixture to <IC>liveFixtures</IC> and appends an
          odds-history row to <IC>liveTicks</IC> each cycle it has fresh odds
          (pruned past 2 hours). <IC>pollState</IC> tracks the last poll&apos;s
          mode, timestamp, note, and featured fixture.
        </P>
        <P>
          <strong className="text-chalk">5. Featuring.</strong> The same
          preference order runs in the poller, the reactive query, and the
          serverless fallback: a live World Cup fixture with odds &gt; any World
          Cup fixture with odds &gt; any in-play fixture with odds &gt; any
          fixture with odds &gt; the first fixture. Never a special-cased pair.
        </P>
      </Section>

      <Section id="api-reference" title="API Reference">
        <P>
          All routes below are <IC>Cache-Control: no-store</IC> and require no
          authentication. None expose the TxLINE API token.
        </P>

        <h3 className="pt-2 text-lg font-bold text-chalk">GET /api/feed</h3>
        <P>
          The <IC>LiveFeed</IC> — same shape <IC>feed.live</IC> returns — read via{" "}
          <IC>lib/txline.server.ts</IC> directly. This is <IC>LiveDataProvider</IC>
          &apos;s polling fallback.
        </P>
        <CodeBlock
          filename="200 OK"
          code={`{
  "mode": "live",
  "updatedAt": 1768000000000,
  "featured": {
    "fixtureId": 100231,
    "home": { "code": "BRA", "name": "Brazil", "flag": "🇧🇷" },
    "away": { "code": "ARG", "name": "Argentina", "flag": "🇦🇷" },
    "score": [1, 1],
    "minute": 63,
    "phase": "LIVE",
    "competition": "FIFA World Cup",
    "odds": { "home": 2.15, "draw": 3.4, "away": 3.1 },
    "probs": { "home": 41.2, "draw": 24.6, "away": 34.2 },
    "startTime": 1767994000000,
    "updatedAt": 1767999998000
  },
  "matches": [ /* every tracked fixture, same shape as featured */ ]
}`}
        />
        <P>
          Unconfigured / upstream down → degrades to{" "}
          <IC>{'{ mode: "sim", featured: null, matches: [] }'}</IC>, and the client
          falls back to the deterministic engine instead of freezing.
        </P>

        <h3 className="pt-2 text-lg font-bold text-chalk">GET /api/live</h3>
        <P>
          Server-truth endpoint: the live feed&apos;s featured match plus the
          local game-clock round timer (independent of the feed itself).
        </P>
        <CodeBlock
          filename="200 OK"
          code={`{
  "mode": "live",
  "ready": true,
  "source": "TxODDS TxLINE World Cup feed (devnet)",
  "now": 1768000000000,
  "nextTickAt": 1768000002000,
  "marquee": "BRA v ARG",
  "competition": "FIFA World Cup",
  "round": {
    "id": "r-31-4",
    "fixtureId": 100231,
    "stat": "WIN",
    "statLabel": "Win probability",
    "lockValue": 41.2,
    "unit": "%",
    "startedAt": 1767999998000,
    "endsAt": 1768000022000,
    "team": "home"
  },
  "featured": { /* same LiveMatch shape as /api/feed */ },
  "matches": [ /* ... */ ]
}`}
        />

        <h3 className="pt-2 text-lg font-bold text-chalk">GET /api/sol-price</h3>
        <P>
          Indicative SOL→USD/GBP conversion (CoinGecko, 60s cache, fixed
          fallback). Display-only — never moves funds.
        </P>
        <CodeBlock
          filename="200 OK"
          code={`{ "at": 1768000000000, "usd": 152.34, "gbp": 120.11, "source": "live" }`}
        />

        <h3 className="pt-2 text-lg font-bold text-chalk">
          GET /api/balance?address=&lt;pubkey&gt;&amp;network=devnet
        </h3>
        <P>Read-only devnet/mainnet SOL balance lookup. `address` is required.</P>
        <CodeBlock
          filename="200 OK"
          code={`{ "address": "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", "network": "devnet", "sol": 1.2345 }`}
        />
      </Section>

      <Section id="schema" title="Schema">
        <P>
          Convex deployment <IC>calm-parrot-940</IC>. Field-level detail is
          authoritative in <IC>convex/schema.ts</IC>.
        </P>
        <Table
          head={["Table", "Purpose", "Indexes"]}
          rows={[
            ["players", "Identity/profile per Clerk user", "by_clerk, by_wallet"],
            ["sessions", "Login sessions", "by_clerk, by_started"],
            ["ledger", "Append-only GOAL/SOL balance movements", "by_clerk, by_clerk_created"],
            ["rewards", "Bonuses, badges, promo codes", "by_clerk, by_clerk_status"],
            ["onboarding", "Onboarding funnel progress", "by_clerk"],
            ["activity", "Catch-all action/screen-view log", "by_clerk, by_clerk_created, by_name"],
            ["gamePlays", "Per-round Hi-Lo / pool / cards detail", "by_clerk, by_fixture"],
            ["packOpens", "Card pack pulls", "by_clerk"],
            ["profileStats", "Rolled-up per-player analytics", "by_clerk"],
            ["pools", "Sweepstakes groups", "by_invite, by_owner"],
            ["poolMembers", "Sweepstakes membership + picks", "by_pool, by_clerk, by_pool_clerk"],
            ["events", "Legacy verifiable event log (back-compat)", "by_clerk"],
            [<><IC>liveFixtures</IC></>, "Current state per tracked fixture (poller-written)", "by_fixture, by_updated"],
            [<><IC>liveTicks</IC></>, "Odds-history time series (poller-written)", "by_fixture_ts"],
            [<><IC>pollState</IC></>, "Poller heartbeat/mode bookkeeping", "by_key"],
            [<><IC>apiKeys</IC></>, "Developer API keys issued from /technicaldoc", "by_clerk, by_key"],
          ]}
        />
        <P>
          <IC>liveFixtures</IC>, <IC>liveTicks</IC>, and <IC>pollState</IC> are the
          three tables the live pipeline actually writes and reads; everything
          else is app state.
        </P>
      </Section>

      <Section id="api-keys" title="API Keys">
        <P>
          Generate a GOLAZO-shaped credential for your own tooling. Stored in the{" "}
          <IC>apiKeys</IC> table (<IC>{'{ clerkId, key, label, createdAt, lastUsedAt?, revoked }'}</IC>
          ), served by <IC>convex/apikeys.ts</IC>:
        </P>
        <ul className="ml-5 list-disc space-y-1.5">
          <li>
            <IC>generateApiKey({"{"} label {"}"})</IC> — mints{" "}
            <IC>glz_</IC> + 32 lowercase base36 characters. The full key is
            returned <strong className="text-chalk">only once</strong>, right here.
          </li>
          <li>
            <IC>listMyKeys()</IC> — your keys, newest first, secret masked to{" "}
            <IC>glz_••••••••1a2b</IC>.
          </li>
          <li>
            <IC>revokeKey({"{"} id {"}"})</IC> — marks one of your own keys
            revoked (ownership checked server-side).
          </li>
        </ul>
        <P>
          These keys aren&apos;t yet checked against anything server-side — there
          is no protected GOLAZO endpoint that requires one today. This is a
          credential-issuance flow for builders, not a live authorization gate.
        </P>
        <ApiKeyPanel />
      </Section>

      <Section id="runbook" title="Runbook">
        <h3 className="text-lg font-bold text-chalk">Environment variables</h3>
        <Table
          head={["Variable", "Where", "Purpose"]}
          rows={[
            ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", ".env.local / Vercel", "Clerk client key"],
            ["CLERK_SECRET_KEY", ".env.local / Vercel", "Clerk server key"],
            ["CLERK_JWT_ISSUER_DOMAIN", "Convex env", "Validates Clerk JWTs inside Convex"],
            ["NEXT_PUBLIC_CONVEX_URL", ".env.local / Vercel", "Convex deployment URL"],
            ["CONVEX_DEPLOYMENT", ".env.local", "Which deployment npx convex dev targets"],
            ["TXLINE_MODE", "Convex env + .env.local", '"sim" (default) or "live"'],
            ["TXLINE_API_ORIGIN", "Convex env + .env.local", "https://txline-dev.txodds.com"],
            ["TXLINE_API_TOKEN", "Convex env + .env.local", "Activated API token — never sent to the browser"],
          ]}
        />

        <h3 className="pt-2 text-lg font-bold text-chalk">
          One-time: activate the TxODDS devnet feed
        </h3>
        <CodeBlock filename="shell" code={`npm install\nnpm run txline:activate`} />
        <P>
          Prints a <IC>TXLINE_API_TOKEN</IC> — set it plus{" "}
          <IC>TXLINE_MODE=live</IC> and <IC>TXLINE_API_ORIGIN</IC> wherever the
          poller runs.
        </P>

        <h3 className="pt-2 text-lg font-bold text-chalk">Convex</h3>
        <CodeBlock filename="shell" code={`npx convex dev`} />

        <h3 className="pt-2 text-lg font-bold text-chalk">Local dev</h3>
        <CodeBlock filename="shell" code={`npm run dev`} />

        <h3 className="pt-2 text-lg font-bold text-chalk">Build / verify</h3>
        <CodeBlock
          filename="shell"
          code={`npm run build\nnpx tsc -p convex/tsconfig.json --noEmit\nnpm run lint`}
        />
        <P>
          Full detail (deploy notes, per-table field lists, honesty notes) lives
          in <IC>TECHNICAL.md</IC> at the repo root.
        </P>
      </Section>
    </>
  );
}
