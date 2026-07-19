"use client";

import { Component, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { SignInButton, useUser } from "@clerk/nextjs";
import { cloudSyncEnabled } from "@/components/ConvexClientProvider";

// convex/apikeys.ts is a new module that won't be in convex/_generated/api
// until the next `npx convex dev`/deploy, so — following the same pattern as
// components/LiveDataProvider.tsx's `feed:live` ref — it's addressed by
// string ref rather than the generated `api` object.
const generateApiKeyRef = makeFunctionReference<"mutation">("apikeys:generateApiKey");
const listMyKeysRef = makeFunctionReference<"query">("apikeys:listMyKeys");
const revokeKeyRef = makeFunctionReference<"mutation">("apikeys:revokeKey");

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

interface ApiKeyRow {
  id: string;
  label: string;
  masked: string;
  createdAt: number;
  lastUsedAt?: number;
  revoked: boolean;
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-raised/60 p-5">{children}</div>
  );
}

function Fallback({ message }: { message: string }) {
  return (
    <Panel>
      <p className="text-sm text-muted">{message}</p>
    </Panel>
  );
}

/** Catches any error from KeyManager's Convex hooks so a not-yet-deployed
 * apikeys:* function (before the user's next `npx convex dev`/deploy) never
 * takes the rest of the docs page down with it — mirrors PlayerSync's
 * SyncErrorBoundary for the same reason. */
class ApiKeyErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ApiKeyPanel] disabled after an error:", error);
    }
  }
  render() {
    if (this.state.failed) {
      return (
        <Fallback message="API keys are temporarily unavailable in this environment. The rest of these docs are unaffected." />
      );
    }
    return this.props.children;
  }
}

/** Clerk + Convex gated API-key generator. Degrades to a static notice when
 * either isn't configured — never crashes the docs page around it. */
export default function ApiKeyPanel() {
  if (!cloudSyncEnabled) {
    return (
      <Fallback message="Convex isn't configured in this environment (NEXT_PUBLIC_CONVEX_URL is unset), so API key generation is unavailable here. The rest of these docs are unaffected." />
    );
  }
  if (!clerkOn) {
    return (
      <Fallback message="Clerk isn't configured in this environment, so sign-in — and API keys — are unavailable here. The rest of these docs are unaffected." />
    );
  }
  return <SignedGate />;
}

function SignedGate() {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="h-32 animate-pulse rounded-xl border border-line bg-raised/40" />;
  }

  if (!isSignedIn) {
    return (
      <Panel>
        <p className="mb-3 text-sm text-muted">
          Sign in to generate a GOLAZO API key for your own tooling.
        </p>
        <SignInButton mode="modal">
          <button className="rounded-full bg-volt px-4 py-2 text-sm font-bold text-night transition-transform hover:scale-[1.03] active:translate-y-px">
            Log in to generate a key
          </button>
        </SignInButton>
      </Panel>
    );
  }

  return (
    <ApiKeyErrorBoundary>
      <KeyManager />
    </ApiKeyErrorBoundary>
  );
}

function KeyManager() {
  const [label, setLabel] = useState("");
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState<{ key: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generateApiKey = useMutation(generateApiKeyRef);
  const revokeKey = useMutation(revokeKeyRef);
  const keys = useQuery(listMyKeysRef, {}) as ApiKeyRow[] | undefined;

  const onGenerate = async () => {
    setPending(true);
    setError(null);
    try {
      const result = (await generateApiKey({ label: label.trim() || "Untitled key" })) as {
        id: string;
        key: string;
        label: string;
      };
      setRevealed({ key: result.key, label: result.label });
      setLabel("");
    } catch {
      setError("Couldn't generate a key — try again.");
    } finally {
      setPending(false);
    }
  };

  const onCopy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  const onRevoke = async (id: string) => {
    try {
      await revokeKey({ id });
    } catch {
      /* best-effort — the list will just still show it as active */
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <label className="mb-2 block text-sm font-semibold text-chalk" htmlFor="api-key-label">
          Label
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="api-key-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. local dev"
            maxLength={60}
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-chalk outline-none focus:border-volt"
          />
          <button
            onClick={onGenerate}
            disabled={pending}
            className="rounded-lg bg-volt px-4 py-2 text-sm font-bold text-night transition-transform hover:scale-[1.02] active:translate-y-px disabled:opacity-50"
          >
            {pending ? "Generating…" : "Generate key"}
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-down">{error}</p> : null}

        {revealed ? (
          <div className="mt-4 rounded-lg border border-volt/40 bg-night/60 p-3">
            <p className="mb-1.5 text-xs text-muted">
              &ldquo;{revealed.label}&rdquo; — copy this now, it won&apos;t be shown again:
            </p>
            <div className="flex items-center justify-between gap-2">
              <code className="overflow-x-auto whitespace-nowrap font-mono text-sm text-volt">
                {revealed.key}
              </code>
              <button
                onClick={() => onCopy(revealed.key)}
                className="shrink-0 rounded-md border border-line px-2.5 py-1 font-mono text-xs text-chalk transition-colors hover:border-volt hover:text-volt"
              >
                {copied ? "copied" : "copy"}
              </button>
            </div>
          </div>
        ) : null}
      </Panel>

      <Panel>
        <p className="mb-3 text-sm font-semibold text-chalk">Your keys</p>
        {keys === undefined ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted">No keys yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {keys.map((k) => (
              <li
                key={k.id}
                className="flex flex-col gap-2 rounded-lg border border-line px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-chalk">{k.label}</div>
                  <div className="font-mono text-xs text-muted">
                    {k.masked} · {new Date(k.createdAt).toLocaleDateString()}
                    {k.revoked ? " · revoked" : ""}
                  </div>
                </div>
                {!k.revoked ? (
                  <button
                    onClick={() => onRevoke(k.id)}
                    className="self-start rounded-md border border-line px-2.5 py-1 text-xs font-semibold text-muted transition-colors hover:border-down/60 hover:text-down sm:self-auto"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
