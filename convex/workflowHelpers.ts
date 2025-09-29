import { internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { leadArgs, telegramArgs } from "./lib/args";
import { v } from "convex/values";
import { neutral } from "../autoResponses/neutral";
import { getMessagePack, buildLanguageKeyboard, buildContactKeyboard } from "./messageUtils";

// Simple query to get lead state
export const getLeadState = internalQuery({
  args: { telegramId: v.number() },
  handler: async (ctx, { telegramId }) => {
    return await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), telegramId))
      .first();
  },
});

// Language reminder sender
export const sendLanguageReminder = internalAction({
  args: {
    ...leadArgs,
    attempt: v.number(),
  },
  handler: async (ctx, { telegramId, chatId, attempt }) => {
    // Increment counter
    await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId,
      type: "language",
    });

    // Choose message: attempt 1 = direct, attempt 2 = softer
    const message = attempt === 1 ? neutral.reminderLanguage : neutral.reminderLanguageSoft;

    // Send to Telegram
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        reply_markup: buildLanguageKeyboard(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }

    return { status: "sent", attempt };
  },
});

// Phone reminder sender
export const sendPhoneReminder = internalAction({
  args: {
    ...telegramArgs,
    attempt: v.number(),
  },
  handler: async (ctx, { telegramId, chatId, language, attempt }) => {
    // Increment counter
    await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId,
      type: "phone",
    });

    const pack = getMessagePack(language);

    // Send to Telegram
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: pack.reminderPhone,
        reply_markup: buildContactKeyboard(language),
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }

    return { status: "sent", attempt, language };
  },
});

// City reminder sender
export const sendCityReminder = internalAction({
  args: {
    ...telegramArgs,
    attempt: v.number(),
  },
  handler: async (ctx, { telegramId, chatId, language, attempt }) => {
    // Increment counter
    await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId,
      type: "city",
    });

    const pack = getMessagePack(language);

    // Send to Telegram
    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: pack.reminderCity,
      }),
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status}`);
    }

    return { status: "sent", attempt, language };
  },
});