import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { isPhoneNumber } from "./messageUtils";

const http = httpRouter();

// Comprehensive Telegram webhook handler for Green Card consultation funnel
const telegramWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const update = await request.json();
    console.log("Telegram update:", JSON.stringify(update, null, 2));

    // Handle different types of updates
    if (update.message) {
      await handleMessage(ctx, update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(ctx, update.callback_query);
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("OK", { status: 200 }); // Always return 200 to Telegram
  }
});

// Handle regular messages
async function handleMessage(ctx: any, message: any) {
  const user = message.from;
  const chatId = message.chat.id;
  const text = message.text;

  // Handle /start command
  if (text && text.startsWith("/start")) {
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
        chatId: chatId,
        firstName: user.first_name,
        hasLanguage: !!result.language,
      });
    }
    return;
  }

  // Handle contact sharing
  if (message.contact) {
    await ctx.runMutation(api.greenCardBot.handlePhoneCapture, {
      telegramId: user.id,
      phoneNumber: message.contact.phone_number,
      isContact: true,
    });

    const lead = await ctx.runMutation(api.greenCardBot.getLeadByTelegramId, {
      telegramId: user.id,
    });

    if (lead?.language) {
      await ctx.runAction(api.greenCardBot.sendCityRequest, {
        chatId: chatId,
        language: lead.language,
      });
    }
    return;
  }

  // Handle regular text messages
  if (text && !text.startsWith("/")) {
    const lead = await ctx.runMutation(api.greenCardBot.getLeadByTelegramId, {
      telegramId: user.id,
    });

    if (!lead) {
      // No lead found, suggest starting over
      return;
    }

    // Handle phone number as text (fallback)
    if (lead.conversationStage === "language_selection" && !lead.phoneNumber) {
      if (isPhoneNumber(text)) {
        await ctx.runMutation(api.greenCardBot.handlePhoneCapture, {
          telegramId: user.id,
          phoneNumber: text,
          isContact: false,
        });

        if (lead.language) {
          await ctx.runAction(api.greenCardBot.sendCityRequest, {
            chatId: chatId,
            language: lead.language,
          });
        }
        return;
      }
    }

    // Handle city input
    if (lead.conversationStage === "qualification" && lead.phoneNumber && !lead.city) {
      await ctx.runMutation(api.greenCardBot.handleCityCapture, {
        telegramId: user.id,
        city: text,
      });

      if (lead.language) {
        await ctx.runAction(api.greenCardBot.sendFinalMessage, {
          chatId: chatId,
          language: lead.language,
        });
      }
      return;
    }
  }
}

// Handle callback queries (inline button presses)
async function handleCallbackQuery(ctx: any, callbackQuery: any) {
  const user = callbackQuery.from;
  const chatId = callbackQuery.message.chat.id;
  const data = callbackQuery.data;

  // Handle language selection
  if (data.startsWith("lang_")) {
    const language = data.replace("lang_", "") as "uz" | "ru" | "kk";

    await ctx.runMutation(api.greenCardBot.handleLanguageSelection, {
      telegramId: user.id,
      language: language,
    });

    await ctx.runAction(api.greenCardBot.sendPhoneRequest, {
      chatId: chatId,
      language: language,
    });

    // Answer the callback query to remove loading state
    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        callback_query_id: callbackQuery.id,
      }),
    });
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
    return new Response("Green Card Bot is running! 🇺🇸", { status: 200 });
  }),
});

export default http;