import { NextResponse } from "next/server";
import { convexClient, linkTelegramByCodeRef } from "@/lib/convex-server";
import { sendTelegramMessage } from "@/lib/telegram";

// Telegram Bot webhook. Set it once with:
//   https://api.telegram.org/bot<TOKEN>/setWebhook
//     ?url=https://<host>/api/telegram/webhook
//     &secret_token=<TELEGRAM_WEBHOOK_SECRET>
//
// Handles `/start <code>` — the one-time code a logged-in user generates in
// Golazo ("Connect Telegram") — linking their Telegram chat to their Clerk
// account so the cron notifier (app/api/cron/notify) can reach them.
export const dynamic = "force-dynamic";

interface TgUpdate {
  message?: { chat?: { id?: number }; text?: string };
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  const chatId = update?.message?.chat?.id;
  const text = update?.message?.text ?? "";

  if (chatId && text.startsWith("/start")) {
    const code = text.split(/\s+/)[1];
    const convex = convexClient();
    if (!code) {
      await sendTelegramMessage(chatId, "Open Golazo → *Connect Telegram* to get your link code, then tap the button.");
    } else if (!convex) {
      await sendTelegramMessage(chatId, "⚠️ Linking is temporarily unavailable.");
    } else {
      try {
        const ok = (await convex.mutation(linkTelegramByCodeRef, { code, chatId: String(chatId) })) as boolean;
        await sendTelegramMessage(
          chatId,
          ok
            ? "✅ *Linked!* You'll get alerts for games you've bet on and your sweepstakes."
            : "⚠️ That link code wasn't recognised or expired — generate a fresh one in Golazo.",
        );
      } catch {
        await sendTelegramMessage(chatId, "⚠️ Linking failed, please try again.");
      }
    }
  }

  // Always 200 so Telegram doesn't retry-storm us.
  return NextResponse.json({ ok: true });
}
