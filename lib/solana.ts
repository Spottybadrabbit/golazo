// Server-only Solana helpers. Keep @solana/web3.js behind a dynamic import so
// this module never gets pulled into a client bundle. Only call from route
// handlers / server components.

export type SolNetwork = "devnet" | "mainnet";

const RPC: Record<SolNetwork, string> = {
  devnet: "https://api.devnet.solana.com",
  mainnet: "https://api.mainnet-beta.solana.com",
};

/**
 * Look up the SOL balance for a base58 address on the given network.
 * Returns SOL (lamports / 1e9) rounded to 4 dp, or null on any failure
 * (invalid address, RPC error, network down).
 */
export async function getSolBalance(
  address: string,
  network: SolNetwork,
): Promise<number | null> {
  try {
    const web3 = await import("@solana/web3.js");
    const pubkey = new web3.PublicKey(address); // throws on a bad address
    const connection = new web3.Connection(RPC[network] ?? RPC.devnet, "confirmed");
    const lamports = await connection.getBalance(pubkey);
    return Math.round((lamports / 1e9) * 1e4) / 1e4;
  } catch {
    return null;
  }
}
