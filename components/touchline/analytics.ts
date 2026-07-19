"use client";

// Touchline analytics (TOUCHLINE_PRD §27). Fires ONLY the six defined events,
// via PostHog's public HTTP capture endpoint — no posthog-js dependency, no
// blocking of the critical path. The project key is a public (client-safe)
// PostHog ingestion key. Every call is best-effort and swallows errors.

export type TouchlineEvent =
  | "dashboard_viewed"
  | "agent_signal_detected"
  | "agent_action_executed"
  | "paper_hedge_executed"
  | "solana_proof_verified"
  | "replay_started";

const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_EWkE9IJRCNxIoTv6JeXoURbZFTsYUeIjmzGIeg91OO7";
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

const DISTINCT_KEY = "touchline.distinct_id";

function distinctId(): string {
  try {
    let id = localStorage.getItem(DISTINCT_KEY);
    if (!id) {
      id = `tl_${Math.abs(hashString(`${navigator.userAgent}:${localStorage.length}:${performance.now()}`))}`;
      localStorage.setItem(DISTINCT_KEY, id);
    }
    return id;
  } catch {
    return "tl_anon";
  }
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

export function track(event: TouchlineEvent, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const body = JSON.stringify({
      api_key: POSTHOG_KEY,
      event,
      properties: { ...props, $lib: "touchline", product: "touchline" },
      distinct_id: distinctId(),
    });
    // keepalive so events survive a navigation; fire-and-forget.
    void fetch(`${POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics must never break the app
  }
}
