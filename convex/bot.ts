import { action } from "./_generated/server";
import { v } from "convex/values";

// Action to show typing indicator
export const showTyping = action({
  args: {
    chatId: v.number(),
  },
  handler: async (ctx, args) => {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        action: "typing",
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send typing action: ${response.status}`);
    }

    return await response.json();
  },
});