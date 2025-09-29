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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const jitterDelay = async (minMs: number, maxMs: number) => {
  const span = maxMs - minMs;
  const delay = span > 0 ? Math.floor(Math.random() * (span + 1)) + minMs : minMs;
  await sleep(delay);
};


// Mutation to handle /start command and lead creation/update
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

    // Check for existing lead
    const existingLead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();

    // Parse start payload
    const parsed = parseStartPayload(args.payload || "");

    // Debounce: prevent duplicate greetings within 30 seconds
    if (existingLead?.lastStartTime && (now - existingLead.lastStartTime) < 30000) {
      return { action: "debounced", leadId: existingLead._id };
    }

    if (existingLead) {
      // Update existing lead
      await ctx.db.patch(existingLead._id, {
        firstName: args.firstName,
        lastName: args.lastName,
        username: args.username,
        lastContactAt: now,
        lastStartTime: now,
        // Set language if provided in payload
        ...(parsed.language && { language: parsed.language }),
        ...(parsed.source && { source: parsed.source }),
        ...(parsed.referralCode && { referralCode: parsed.referralCode }),
      });

      return { action: "updated", leadId: existingLead._id, language: parsed.language };
    } else {
      // Create new lead
      const leadId = await ctx.db.insert("leads", {
        telegramId: args.telegramId,
        firstName: args.firstName,
        lastName: args.lastName,
        username: args.username,
        isBot: args.isBot || false,
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
        scheduledReminderIds: [],
      });

      // If no language provided, schedule first language reminder for 90 seconds
      if (!parsed.language) {
        const jobId = await ctx.scheduler.runAfter(90000, internal.scheduler.sendLanguageReminderScheduled, {
          leadId,
          telegramId: args.telegramId,
          chatId: args.telegramId,
          attempt: 1,
        });

        // Update lead with scheduled job info
        await ctx.db.patch(leadId, {
          scheduledReminderIds: [jobId],
          nextReminderAt: now + 90000,
          activeReminderType: "language",
        });
      }

      return { action: "created", leadId, language: parsed.language };
    }
  },
});

// Mutation to handle language selection
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

    // Cancel any scheduled language reminders
    if (lead.scheduledReminderIds && lead.activeReminderType === "language") {
      for (const jobId of lead.scheduledReminderIds) {
        try {
          await ctx.scheduler.cancel(jobId);
        } catch (error) {
          console.warn(`Failed to cancel language reminder job ${jobId}:`, error);
        }
      }
    }

    await ctx.db.patch(lead._id, {
      language: args.language,
      conversationStage: "language_selection",
      lastContactAt: Date.now(),
      scheduledReminderIds: [], // Clear old scheduled jobs
      nextReminderAt: undefined,
      activeReminderType: undefined,
    });

    // Schedule phone reminder for 2 minutes
    const jobId = await ctx.scheduler.runAfter(120000, internal.scheduler.sendPhoneReminderScheduled, {
      leadId: lead._id,
      telegramId: args.telegramId,
      chatId: args.telegramId,
      language: args.language,
      attempt: 1,
    });

    // Update with new scheduled job
    await ctx.db.patch(lead._id, {
      scheduledReminderIds: [jobId],
      nextReminderAt: Date.now() + 120000,
      activeReminderType: "phone",
    });

    return { leadId: lead._id };
  },
});

// Mutation to handle phone number capture
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

    // Cancel any scheduled phone reminders
    if (lead.scheduledReminderIds && lead.activeReminderType === "phone") {
      for (const jobId of lead.scheduledReminderIds) {
        try {
          await ctx.scheduler.cancel(jobId);
        } catch (error) {
          console.warn(`Failed to cancel phone reminder job ${jobId}:`, error);
        }
      }
    }

    const normalizedPhone = normalizePhoneNumber(args.phoneNumber);

    await ctx.db.patch(lead._id, {
      phoneNumber: normalizedPhone,
      status: "contacted",
      conversationStage: "qualification",
      lastContactAt: Date.now(),
      scheduledReminderIds: [], // Clear old scheduled jobs
      nextReminderAt: undefined,
      activeReminderType: undefined,
    });

    // Schedule city reminder for 2 minutes if we have language
    if (lead.language) {
      const jobId = await ctx.scheduler.runAfter(120000, internal.scheduler.sendCityReminderScheduled, {
        leadId: lead._id,
        telegramId: args.telegramId,
        chatId: args.telegramId,
        language: lead.language,
        attempt: 1,
      });

      // Update with new scheduled job
      await ctx.db.patch(lead._id, {
        scheduledReminderIds: [jobId],
        nextReminderAt: Date.now() + 120000,
        activeReminderType: "city",
      });
    }

    return { leadId: lead._id, language: lead.language };
  },
});

// Mutation to handle city capture
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

    // Cancel any scheduled city reminders
    if (lead.scheduledReminderIds && lead.activeReminderType === "city") {
      for (const jobId of lead.scheduledReminderIds) {
        try {
          await ctx.scheduler.cancel(jobId);
        } catch (error) {
          console.warn(`Failed to cancel city reminder job ${jobId}:`, error);
        }
      }
    }

    // Set next follow-up to 7 days from now
    const nextFollowUp = Date.now() + (7 * 24 * 60 * 60 * 1000);

    await ctx.db.patch(lead._id, {
      city: args.city,
      status: "interested",
      conversationStage: "interest_building",
      lastContactAt: Date.now(),
      nextFollowUpAt: nextFollowUp,
      scheduledReminderIds: [], // Clear all scheduled jobs
      nextReminderAt: undefined,
      activeReminderType: undefined,
    });

    return { leadId: lead._id, language: lead.language };
  },
});

// Query to get lead by telegram ID
export const getLeadByTelegramId = query({
  args: { telegramId: v.number() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();
  },
});

// Action to send greeting message
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

    // Show typing indicator
    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });

    // Random delay between 2-4 seconds for greeting
    await jitterDelay(200, 500);

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: fullMessage,
        reply_markup: buildLanguageKeyboard(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send greeting: ${response.status}`);
    }

    return await response.json();
  },
});

// Action to send phone request
export const sendPhoneRequest = action({
  args: {
    chatId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args) => {
    const pack = getMessagePack(args.language);

    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });

    await jitterDelay(150, 400);

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: pack.askPhone,
        reply_markup: buildContactKeyboard(args.language),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send phone request: ${response.status}`);
    }

    return await response.json();
  },
});

// Action to send city request
export const sendCityRequest = action({
  args: {
    chatId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args) => {
    const pack = getMessagePack(args.language);

    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });

    await jitterDelay(150, 400);

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: pack.askCity,
        reply_markup: removeKeyboard(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send city request: ${response.status}`);
    }

    return await response.json();
  },
});

// Action to send final message
export const sendFinalMessage = action({
  args: {
    chatId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args) => {
    const pack = getMessagePack(args.language);

    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });

    await jitterDelay(200, 600);

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: pack.final,
        reply_markup: removeKeyboard(),
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send final message: ${response.status}`);
    }

    return await response.json();
  },
});
