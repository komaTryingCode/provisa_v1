import type { JSONValue } from "convex/values";

class TelegramError extends Error {
  constructor(message: string, public readonly status: number, public readonly payload?: string) {
    super(message);
  }
}

const TELEGRAM_BASE = () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN environment variable");
  }
  return `https://api.telegram.org/bot${token}`;
};

async function postTelegram<TResponse = JSONValue>(
  path: string,
  body: Record<string, unknown>,
): Promise<TResponse> {
  const response = await fetch(`${TELEGRAM_BASE()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new TelegramError(`Telegram API request failed (${response.status})`, response.status, text);
  }

  return (await response.json()) as TResponse;
}

export async function sendMessage(args: {
  chatId: number;
  text: string;
  replyMarkup?: JSONValue;
  parseMode?: "Markdown" | "MarkdownV2" | "HTML";
}): Promise<JSONValue> {
  const { chatId, text, replyMarkup, parseMode } = args;
  return await postTelegram("/sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: parseMode,
    reply_markup: replyMarkup,
  });
}

export async function answerCallbackQuery(args: { callbackQueryId: string }): Promise<JSONValue> {
  const { callbackQueryId } = args;
  return await postTelegram("/answerCallbackQuery", {
    callback_query_id: callbackQueryId,
  });
}

export async function sendChatAction(args: { chatId: number; action: "typing" | "upload_document" | "upload_photo" }): Promise<JSONValue> {
  const { chatId, action } = args;
  return await postTelegram("/sendChatAction", {
    chat_id: chatId,
    action,
  });
}

export async function sendContactRequest(args: {
  chatId: number;
  text: string;
  replyMarkup: JSONValue;
}): Promise<JSONValue> {
  const { chatId, text, replyMarkup } = args;
  return await sendMessage({ chatId, text, replyMarkup });
}

export { TelegramError };
