import { internalQuery, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { leadArgs, telegramArgs } from "./lib/args";
import { v } from "convex/values";
import { neutral } from "../autoResponses/neutral";
import { getMessagePack, buildLanguageKeyboard, buildContactKeyboard } from "./messageUtils";
import type { Doc } from "./_generated/dataModel";
import { sendMessage } from "./lib/telegram";

export type LeadDoc = Doc<"leads">;

export const getLeadState = internalQuery({
  args: { telegramId: v.number() },
  handler: async (ctx, { telegramId }): Promise<LeadDoc | null> => {
    return await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), telegramId))
      .first();
  },
});

export const sendLanguageReminder = internalAction({
  args: {
    ...leadArgs,
    attempt: v.number(),
  },
  handler: async (ctx, { leadId, telegramId, chatId, attempt }) => {
    void leadId;
    await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId,
      type: "language",
    });

    const message =
      attempt === 1 ? neutral.reminderLanguage : neutral.reminderLanguageSoft;

    await sendMessage({
      chatId,
      text: message,
      replyMarkup: buildLanguageKeyboard(),
    });

    return { status: "sent", attempt } as const;
  },
});

export const sendPhoneReminder = internalAction({
  args: {
    ...telegramArgs,
    attempt: v.number(),
  },
  handler: async (ctx, { leadId, telegramId, chatId, language, attempt }) => {
    void leadId;
    await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId,
      type: "phone",
    });

    const pack = getMessagePack(language);

    await sendMessage({
      chatId,
      text: pack.reminderPhone,
      replyMarkup: buildContactKeyboard(language),
    });

    return { status: "sent", attempt, language } as const;
  },
});

export const sendCityReminder = internalAction({
  args: {
    ...telegramArgs,
    attempt: v.number(),
  },
  handler: async (ctx, { leadId, telegramId, chatId, language, attempt }) => {
    void leadId;
    await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId,
      type: "city",
    });

    const pack = getMessagePack(language);

    await sendMessage({
      chatId,
      text: pack.reminderCity,
    });

    return { status: "sent", attempt, language } as const;
  },
});








