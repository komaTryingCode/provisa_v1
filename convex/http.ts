import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { isPhoneNumber } from "./messageUtils";
import type { Doc } from "./_generated/dataModel";

// Derive the Convex HTTP action context type without resorting to any
type HttpCtx = Parameters<Parameters<typeof httpAction>[0]>[0];

type LeadDoc = Doc<"leads">;

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramContact = {
  phone_number: string;
};

type TelegramMessage = {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  text?: string;
  contact?: TelegramContact;
};

type TelegramCallbackQuery = {
  id: string;
  from: TelegramUser;
  message: TelegramMessage;
  data?: string;
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

const http = httpRouter();

// Telegram webhook handler with stricter error handling and minimal logging
const telegramWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch (error) {
    console.error("Failed to parse Telegram webhook payload", error);
    return new Response("Invalid payload", { status: 400 });
  }

  const summary = {
    hasMessage: Boolean(update.message),
    hasCallback: Boolean(update.callback_query),
    chatId: update.message?.chat.id ?? update.callback_query?.message.chat.id,
  };

  try {
    if (update.message) {
      await handleMessage(ctx, update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(ctx, update.callback_query);
    } else {
      console.warn("Unhandled Telegram update", summary);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Telegram webhook handler error", { error, summary });
    return new Response("Failed to process webhook", { status: 500 });
  }
});

// Handle regular messages
async function handleMessage(ctx: HttpCtx, message: TelegramMessage): Promise<void> {
  const user = message.from;
  const chatId = message.chat.id;
  const text = message.text?.trim();

  if (text?.startsWith("/start")) {
    const result = await ctx.runMutation(api.greenCardBot.handleStart, {
      telegramId: user.id,
      firstName: user.first_name,
      lastName: user.last_name,
      username: user.username,
      isBot: user.is_bot,
      payload: text,
    });

    if (result.action !== "debounced") {
      await ctx.runAction(api.greenCardBot.sendGreeting, {
        chatId,
        firstName: user.first_name,
        hasLanguage: Boolean(result.language),
      });
    }
    return;
  }

  if (message.contact) {
    await ctx.runMutation(api.greenCardBot.handlePhoneCapture, {
      telegramId: user.id,
      phoneNumber: message.contact.phone_number,
      isContact: true,
    });

    const lead = await ctx.runQuery(api.greenCardBot.getLeadByTelegramId, {
      telegramId: user.id,
    }) as LeadDoc | null;

    if (lead?.language) {
      await ctx.runAction(api.greenCardBot.sendCityRequest, {
        chatId,
        language: lead.language,
      });
    }
    return;
  }

  if (text && !text.startsWith("/")) {
    const lead = await ctx.runQuery(api.greenCardBot.getLeadByTelegramId, {
      telegramId: user.id,
    }) as LeadDoc | null;

    if (!lead) {
      console.warn("Text message without lead", { chatId, telegramId: user.id });
      return;
    }

    if (lead.conversationStage === "language_selection" && !lead.phoneNumber) {
      if (isPhoneNumber(text)) {
        await ctx.runMutation(api.greenCardBot.handlePhoneCapture, {
          telegramId: user.id,
          phoneNumber: text,
          isContact: false,
        });

        if (lead.language) {
          await ctx.runAction(api.greenCardBot.sendCityRequest, {
            chatId,
            language: lead.language,
          });
        }
      }
      return;
    }

    if (lead.conversationStage === "qualification" && lead.phoneNumber && !lead.city) {
      await ctx.runMutation(api.greenCardBot.handleCityCapture, {
        telegramId: user.id,
        city: text,
      });

      if (lead.language) {
        await ctx.runAction(api.greenCardBot.sendFinalMessage, {
          chatId,
          language: lead.language,
        });
      }
    }
  }
}

// Handle callback queries (inline button presses)
async function handleCallbackQuery(ctx: HttpCtx, callbackQuery: TelegramCallbackQuery): Promise<void> {
  const user = callbackQuery.from;
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  if (data?.startsWith("lang_")) {
    const language = data.replace("lang_", "") as "uz" | "ru" | "kk";

    await ctx.runMutation(api.greenCardBot.handleLanguageSelection, {
      telegramId: user.id,
      language,
    });

    await ctx.runAction(api.greenCardBot.sendPhoneRequest, {
      chatId,
      language,
    });

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQuery.id,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to answer callback query (${response.status}): ${errorText}`);
    }
  }
}

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: telegramWebhook,
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response("Green Card Bot is running! \u{1F680}", { status: 200 });
  }),
});

export default http;
