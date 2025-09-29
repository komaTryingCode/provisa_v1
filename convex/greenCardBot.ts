import { mutation, action, query } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { neutral } from "../autoResponses/neutral";
import {
  getMessagePack,
  buildLanguageKeyboard,
  buildContactKeyboard,
  removeKeyboard,
  parseStartPayload,
  normalizePhoneNumber,
} from "./messageUtils";
import { sendMessage } from "./lib/telegram";
import { workflows } from "./index";

const WORKFLOW_CHAT_ID = (telegramId: number) => telegramId;

export const handleStart = mutation({
  args: {
    telegramId: v.number(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    isBot: v.optional(v.boolean()),
    payload: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const existingLead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();

    const parsed = parseStartPayload(args.payload || "");

    if (existingLead?.lastStartTime && now - existingLead.lastStartTime < 30_000) {
      return { action: "debounced", leadId: existingLead._id };
    }

    if (existingLead) {
      await ctx.db.patch(existingLead._id, {
        firstName: args.firstName,
        lastName: args.lastName,
        username: args.username,
        lastContactAt: now,
        lastStartTime: now,
        ...(parsed.language && { language: parsed.language }),
        ...(parsed.source && { source: parsed.source }),
        ...(parsed.referralCode && { referralCode: parsed.referralCode }),
      });

      return { action: "updated", leadId: existingLead._id, language: parsed.language };
    }

    const leadId = await ctx.db.insert("leads", {
      telegramId: args.telegramId,
      firstName: args.firstName,
      lastName: args.lastName,
      username: args.username,
      isBot: args.isBot ?? false,
      language: parsed.language,
      status: "new",
      conversationStage: "greeting",
      createdAt: now,
      lastContactAt: now,
      lastStartTime: now,
      languagePromptAttempts: 0,
      phonePromptAttempts: 0,
      cityPromptAttempts: 0,
      source: parsed.source || "direct",
      referralCode: parsed.referralCode,
    });

    await workflows.start(ctx, internal.workflows.leadNurturingWorkflow, {
      leadId,
      telegramId: args.telegramId,
      chatId: WORKFLOW_CHAT_ID(args.telegramId),
      firstName: args.firstName,
    });

    return { action: "created", leadId, language: parsed.language };
  },
});

export const handleLanguageSelection = mutation({
  args: {
    telegramId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();

    if (!lead) {
      throw new Error("Lead not found");
    }

    await ctx.db.patch(lead._id, {
      language: args.language,
      conversationStage: "language_selection",
      lastContactAt: Date.now(),
    });

    return { leadId: lead._id };
  },
});

export const handlePhoneCapture = mutation({
  args: {
    telegramId: v.number(),
    phoneNumber: v.string(),
    isContact: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();

    if (!lead) {
      throw new Error("Lead not found");
    }

    const normalizedPhone = normalizePhoneNumber(args.phoneNumber);

    await ctx.db.patch(lead._id, {
      phoneNumber: normalizedPhone,
      status: "contacted",
      conversationStage: "qualification",
      lastContactAt: Date.now(),
    });

    return { leadId: lead._id, language: lead.language };
  },
});

export const handleCityCapture = mutation({
  args: {
    telegramId: v.number(),
    city: v.string(),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();

    if (!lead) {
      throw new Error("Lead not found");
    }

    const nextFollowUp = Date.now() + 7 * 24 * 60 * 60 * 1000;

    await ctx.db.patch(lead._id, {
      city: args.city,
      status: "interested",
      conversationStage: "interest_building",
      lastContactAt: Date.now(),
      nextFollowUpAt: nextFollowUp,
    });

    return { leadId: lead._id, language: lead.language };
  },
});

export const getLeadByTelegramId = query({
  args: { telegramId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();
  },
});

export const sendGreeting = action({
  args: {
    chatId: v.number(),
    firstName: v.string(),
    hasLanguage: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const greetingText = neutral.greeting(args.firstName);
    const languageText = neutral.selectLanguage;
    const fullMessage = `${greetingText}\n\n${languageText}`;

    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });
    await sendMessage({
      chatId: args.chatId,
      text: fullMessage,
      replyMarkup: buildLanguageKeyboard(),
    });
    return { ok: true };
  },
});

export const sendPhoneRequest = action({
  args: {
    chatId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args) => {
    const pack = getMessagePack(args.language);

    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });
    await sendMessage({
      chatId: args.chatId,
      text: pack.askPhone,
      replyMarkup: buildContactKeyboard(args.language),
    });
    return { ok: true };
  },
});

export const sendCityRequest = action({
  args: {
    chatId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args) => {
    const pack = getMessagePack(args.language);

    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });
    await sendMessage({
      chatId: args.chatId,
      text: pack.askCity,
      replyMarkup: removeKeyboard(),
    });
    return { ok: true };
  },
});

export const sendFinalMessage = action({
  args: {
    chatId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args) => {
    const pack = getMessagePack(args.language);

    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });
    await sendMessage({
      chatId: args.chatId,
      text: pack.final,
      replyMarkup: removeKeyboard(),
    });
    return { ok: true };
  },
});


