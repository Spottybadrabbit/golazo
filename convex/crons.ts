import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

// Convex crons fire at most once per minute, so the fast 1-2s polling is done
// by the self-rescheduling poller. This heartbeat just makes sure that loop is
// alive, restarting it if it has stalled.
const crons = cronJobs();
crons.interval("txodds poll heartbeat", { seconds: 60 }, internal.feed.heartbeat, {});
export default crons;
