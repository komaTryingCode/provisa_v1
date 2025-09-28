import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// Simple Telegram webhook handler
const telegramWebhook = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const update = await request.json();
    console.log("Telegram update:", update);

    // Only handle messages with /start command
    if (update.message && update.message.text === "/start") {
      const user = update.message.from;
      const chatId = update.message.chat.id;

      // Store the soft lead
      await ctx.runMutation(api.bot.storeSoftLead, {
        telegramId: user.id,
        username: user.username,
        firstName: user.first_name,
      });

      // Send greeting with human-like typing behavior
      await ctx.runAction(api.bot.sendGreetingWithTyping, {
        chatId: chatId,
        firstName: user.first_name,
      });
    }

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response("OK", { status: 200 }); // Always return 200 to Telegram
  }
});

http.route({
  path: "/telegram/webhook",
  method: "POST",
  handler: telegramWebhook,
});

http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () => {
    return new Response("Bot is running!", { status: 200 });
  }),
});

export default http;