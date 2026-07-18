"use client";

import {
  SignInButton,
  SignInWithMetamaskButton,
  UserButton,
  useUser,
} from "@clerk/nextjs";
import WalletButton from "@/components/WalletButton";

const clerkOn = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);

/**
 * Account control. With Clerk configured it drives real sign-in, including a
 * one-tap Web3 wallet (MetaMask SIWE) path, and shows the account menu once in.
 * Without keys it degrades to the demo wallet chip so the game still runs.
 */
export default function AuthButton() {
  if (!clerkOn) return <WalletButton />;
  return <ClerkAuth />;
}

function ClerkAuth() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
    return (
      <span className="h-8 w-24 animate-pulse rounded-full border border-line bg-surface" />
    );
  }

  if (isSignedIn) {
    const label =
      user.username ||
      user.primaryEmailAddress?.emailAddress?.split("@")[0] ||
      user.web3Wallets?.[0]?.web3Wallet?.slice(0, 6) ||
      "player";
    return (
      <div className="flex items-center gap-2">
        <span className="hidden max-w-28 truncate rounded-full border border-line bg-surface px-3 py-1.5 font-mono text-xs text-chalk sm:inline">
          {label}
        </span>
        <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <SignInWithMetamaskButton mode="modal">
        <button
          title="Sign in with a Web3 wallet"
          className="hidden items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-2 text-sm font-bold text-chalk transition-colors hover:border-volt/60 active:translate-y-px sm:flex"
        >
          <WalletGlyph />
          Wallet
        </button>
      </SignInWithMetamaskButton>
      <SignInButton mode="modal">
        <button className="flex items-center gap-2 rounded-full bg-volt px-4 py-2 text-sm font-bold text-night transition-transform hover:scale-[1.03] active:translate-y-px">
          Sign in
        </button>
      </SignInButton>
    </div>
  );
}

function WalletGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3.5" width="13" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="11.2" cy="9.6" r="1.1" fill="currentColor" />
    </svg>
  );
}
