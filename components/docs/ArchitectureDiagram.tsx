interface Stage {
  tag: string;
  title: string;
  detail: string;
  file?: string;
}

const STAGES: Stage[] = [
  {
    tag: "1 · Solana devnet",
    title: "On-chain activation",
    detail:
      "subscribe(service_level=1, weeks=4) on the TxODDS Anchor program, idempotently creating the TxL Token-2022 ATA in the same tx. Then a guest-JWT + signed-message handshake mints TXLINE_API_TOKEN.",
    file: "scripts/txline-activate.mts",
  },
  {
    tag: "2 · TxODDS devnet API",
    title: "Fixtures · Odds · Scores",
    detail:
      "GET /api/fixtures/snapshot, /api/odds/snapshot/{id}, /api/scores/snapshot/{id} — authed with Authorization: Bearer <guest jwt> + X-Api-Token.",
    file: "convex/txline.ts · lib/txline.server.ts",
  },
  {
    tag: "3 · Convex poller",
    title: "Self-rescheduling loop",
    detail:
      "1.5s cadence while a fixture is in-play, 45s when idle. A 60s cron heartbeat restarts the loop if it stalls.",
    file: "convex/poller.ts · convex/crons.ts",
  },
  {
    tag: "4 · Convex tables",
    title: "liveFixtures · liveTicks · pollState",
    detail:
      "Current state per fixture (upserted), an odds-history time series, and poller heartbeat/mode bookkeeping.",
    file: "convex/schema.ts",
  },
  {
    tag: "5 · Reactive read",
    title: "feed.live",
    detail:
      "An auth-free Convex query the client subscribes to reactively (push updates). /api/feed polls the same real data as a fallback — the API token never reaches the browser either way.",
    file: "convex/feed.ts · components/LiveDataProvider.tsx",
  },
  {
    tag: "6 · The app",
    title: "Hi-Lo · Cards · Squad · PunditBot",
    detail: "Every screen renders this real feed. No simulator.",
  },
];

/** Clean CSS/flex flow diagram: TxODDS → Activation → Convex Poller → feed.live → App. */
export default function ArchitectureDiagram() {
  return (
    <div className="flex flex-col items-stretch">
      {STAGES.map((s, i) => (
        <div key={s.title} className="flex flex-col items-stretch">
          <div className="rounded-xl border border-line bg-raised/60 p-4 sm:p-5">
            <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-volt">
              {s.tag}
            </div>
            <div className="mb-1.5 text-base font-bold text-chalk sm:text-lg">{s.title}</div>
            <p className="text-sm leading-relaxed text-muted">{s.detail}</p>
            {s.file ? (
              <div className="mt-2.5 font-mono text-[11px] text-muted/80">{s.file}</div>
            ) : null}
          </div>
          {i < STAGES.length - 1 ? (
            <div className="flex justify-center py-1.5" aria-hidden="true">
              <svg width="18" height="22" viewBox="0 0 18 22" fill="none">
                <path d="M9 0v16" stroke="var(--volt)" strokeWidth="2" />
                <path d="M2 13l7 8 7-8" stroke="var(--volt)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
