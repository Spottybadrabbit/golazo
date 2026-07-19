// Telegram Bot API helper — SERVER ONLY. Never expose TELEGRAM_BOT_TOKEN to the
// browser (no NEXT_PUBLIC_ prefix). Used by the cron notifier and the webhook.

const API = "https://api.telegram.org";

export function telegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export interface TelegramSendResult {
  ok: boolean;
  chatId: string;
  error?: string;
}

/**
 * Send a Markdown message to a Telegram chat. Never throws — resolves with
 * `ok:false` and a reason on any failure, so one bad chat can't abort a batch.
 */
export async function sendTelegramMessage(
  chatId: string | number,
  text: string,
): Promise<TelegramSendResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, chatId: String(chatId), error: "TELEGRAM_BOT_TOKEN not set" };
  try {
    const res = await fetch(`${API}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; description?: string };
    if (!res.ok || !data.ok) {
      return { ok: false, chatId: String(chatId), error: data.description ?? `HTTP ${res.status}` };
    }
    return { ok: true, chatId: String(chatId) };
  } catch (err) {
    return { ok: false, chatId: String(chatId), error: err instanceof Error ? err.message : String(err) };
  }
}
