/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as activity from "../activity.js";
import type * as apikeys from "../apikeys.js";
import type * as crons from "../crons.js";
import type * as feed from "../feed.js";
import type * as game from "../game.js";
import type * as merkle from "../merkle.js";
import type * as merkleStore from "../merkleStore.js";
import type * as notify from "../notify.js";
import type * as players from "../players.js";
import type * as poller from "../poller.js";
import type * as pools from "../pools.js";
import type * as profile from "../profile.js";
import type * as settlement from "../settlement.js";
import type * as teams from "../teams.js";
import type * as touchline from "../touchline.js";
import type * as touchlineVerify from "../touchlineVerify.js";
import type * as txline from "../txline.js";
import type * as wallet from "../wallet.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  activity: typeof activity;
  apikeys: typeof apikeys;
  crons: typeof crons;
  feed: typeof feed;
  game: typeof game;
  merkle: typeof merkle;
  merkleStore: typeof merkleStore;
  notify: typeof notify;
  players: typeof players;
  poller: typeof poller;
  pools: typeof pools;
  profile: typeof profile;
  settlement: typeof settlement;
  teams: typeof teams;
  touchline: typeof touchline;
  touchlineVerify: typeof touchlineVerify;
  txline: typeof txline;
  wallet: typeof wallet;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
