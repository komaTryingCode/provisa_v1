import { mutation, action } from "./_generated/server";
import { v } from "convex/values";

// Simple mutation to store a soft lead
export const storeSoftLead = mutation({
  args: {
    telegramId: v.number(),
    username: v.optional(v.string()),
    firstName: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if lead already exists
    const existing = await ctx.db
      .query("soft_leads")
      .filter((q) => q.eq(q.field("telegram_id"), args.telegramId))
      .first();

    if (!existing) {
      // Store new soft lead
      await ctx.db.insert("soft_leads", {
        telegram_id: args.telegramId,
        username: args.username,
        first_name: args.firstName,
        joined_at: Date.now(),
      });
    }

    return existing ? "existing" : "new";
  },
});

// Simple action to send message back to Telegram
export const sendGreeting = action({
  args: {
    chatId: v.number(),
    firstName: v.string(),
  },
  handler: async (ctx, args) => {
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: `Hello ${args.firstName}! Welcome, soft lead!`,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.status}`);
    }

    return await response.json();
  },
});