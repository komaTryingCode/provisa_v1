import { mutation, action } from "./_generated/server";
import { api } from "./_generated/api";
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

// Action to send greeting with human-like typing behavior
export const sendGreetingWithTyping = action({
  args: {
    chatId: v.number(),
    firstName: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate random delay between 4-8 seconds (4000-8000ms)
    const randomDelay = Math.floor(Math.random() * 4000) + 4000;

    // Show initial typing indicator
    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });

    // If delay is longer than 5 seconds, schedule a mid-typing refresh
    if (randomDelay > 5000) {
      await ctx.scheduler.runAfter(4000, api.bot.showTyping, {
        chatId: args.chatId
      });
    }

    // Schedule the actual message
    await ctx.scheduler.runAfter(randomDelay, api.bot.sendGreeting, {
      chatId: args.chatId,
      firstName: args.firstName,
    });

    return {
      status: "typing_started",
      delay_ms: randomDelay,
      delay_seconds: Math.round(randomDelay / 1000 * 10) / 10
    };
  },
});

// Keep original simple greeting for backward compatibility
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