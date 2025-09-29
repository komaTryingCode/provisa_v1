import { internalMutation, internalAction } from "./_generated/server";
import { internal, api } from "./_generated/api";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { neutral } from "../autoResponses/neutral";
import { getMessagePack, buildLanguageKeyboard, buildContactKeyboard } from "./messageUtils";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const jitterDelay = async (minMs: number, maxMs: number) => {
  const span = maxMs - minMs;
  const delay = span > 0 ? Math.floor(Math.random() * (span + 1)) + minMs : minMs;
  await sleep(delay);
};

type LeadDoc = Doc<"leads">;

// Helper mutation to update scheduled reminder data
export const updateScheduledReminder = internalMutation({
  args: {
    leadId: v.id("leads"),
    jobIds: v.optional(v.array(v.id("_scheduled_functions"))),
    nextReminderAt: v.optional(v.number()),
    activeReminderType: v.optional(v.union(v.literal("language"), v.literal("phone"), v.literal("city"))),
    clearJobs: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const updates: Partial<LeadDoc> = {};

    if (args.clearJobs) {
      updates.scheduledReminderIds = [];
      updates.nextReminderAt = undefined;
      updates.activeReminderType = undefined;
    } else {
      if (args.jobIds) updates.scheduledReminderIds = args.jobIds;
      if (args.nextReminderAt) updates.nextReminderAt = args.nextReminderAt;
      if (args.activeReminderType) updates.activeReminderType = args.activeReminderType;
    }

    await ctx.db.patch(args.leadId, updates);
    return { updated: true };
  },
});

// LANGUAGE REMINDER SYSTEM
export const sendLanguageReminderScheduled = internalAction({
  args: {
    leadId: v.id("leads"),
    telegramId: v.number(),
    chatId: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Get current lead state using query (actions can't use ctx.db.get)
    const lead = await ctx.runQuery(api.greenCardBot.getLeadByTelegramId, {
      telegramId: args.telegramId,
    }) as Doc<"leads"> | null;

    if (!lead) {
      return { status: "skipped", reason: "lead not found" };
    }

    // Safety check: skip if no longer needed
    if (lead.language || lead.status === "cold" || lead.conversationStage !== "greeting") {
      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        clearJobs: true,
      });
      return { status: "skipped", reason: "no longer needed" };
    }

    // Increment attempt counter
    const updatedLead = await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId: args.telegramId,
      type: "language",
    });

    if (!updatedLead) {
      return { status: "error", reason: "failed to update lead" };
    }

    // Check if should mark as cold (after 3 attempts)
    if (updatedLead.languagePromptAttempts >= 3) {
      await ctx.runMutation(internal.nudges.markLeadAsCold, {
        telegramId: args.telegramId,
      });
      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        clearJobs: true,
      });
      return { status: "marked_cold", attempts: updatedLead.languagePromptAttempts };
    }

    // Choose message: first reminder = direct, second = softer
    const message = updatedLead.languagePromptAttempts === 1
      ? neutral.reminderLanguage
      : neutral.reminderLanguageSoft;

    try {
      // Send reminder with natural delay
      await jitterDelay(120, 300);

      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: args.chatId,
          text: message,
          reply_markup: buildLanguageKeyboard(),
        }),
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.status}`);
      }

      // Schedule next reminder (90s → 3.5min → 5.5min)
      const nextDelay = 120000; // Always 2 minutes for subsequent reminders
      const nextJobId = await ctx.scheduler.runAfter(
        nextDelay,
        internal.scheduler.sendLanguageReminderScheduled,
        {
          leadId: args.leadId,
          telegramId: args.telegramId,
          chatId: args.chatId,
          attempt: updatedLead.languagePromptAttempts + 1,
        }
      );

      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        jobIds: [nextJobId],
        nextReminderAt: Date.now() + nextDelay,
        activeReminderType: "language",
      });

      return {
        status: "sent",
        attempt: updatedLead.languagePromptAttempts,
        nextScheduledFor: Date.now() + nextDelay,
      };

    } catch (error) {
      console.error(`Failed to send language reminder to ${args.telegramId}:`, error);

      // Retry in 30 seconds
      const retryJobId = await ctx.scheduler.runAfter(
        30000,
        internal.scheduler.sendLanguageReminderScheduled,
        {
          leadId: args.leadId,
          telegramId: args.telegramId,
          chatId: args.chatId,
          attempt: args.attempt, // Same attempt, retry
        }
      );

      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        jobIds: [retryJobId],
        nextReminderAt: Date.now() + 30000,
        activeReminderType: "language",
      });

      return { status: "error", error: String(error), retryIn: 30000 };
    }
  },
});

// PHONE REMINDER SYSTEM
export const sendPhoneReminderScheduled = internalAction({
  args: {
    leadId: v.id("leads"),
    telegramId: v.number(),
    chatId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Get current lead state using query (actions can't use ctx.db.get)
    const lead = await ctx.runQuery(api.greenCardBot.getLeadByTelegramId, {
      telegramId: args.telegramId,
    }) as Doc<"leads"> | null;

    if (!lead) {
      return { status: "skipped", reason: "lead not found" };
    }

    // Safety check: skip if no longer needed
    if (lead.phoneNumber || lead.status === "cold" || lead.conversationStage !== "language_selection") {
      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        clearJobs: true,
      });
      return { status: "skipped", reason: "no longer needed" };
    }

    // Increment attempt counter
    const updatedLead = await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId: args.telegramId,
      type: "phone",
    });

    if (!updatedLead) {
      return { status: "error", reason: "failed to update lead" };
    }

    // Check if should mark as cold (after 3 attempts)
    if (updatedLead.phonePromptAttempts >= 3) {
      await ctx.runMutation(internal.nudges.markLeadAsCold, {
        telegramId: args.telegramId,
      });
      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        clearJobs: true,
      });
      return { status: "marked_cold", attempts: updatedLead.phonePromptAttempts };
    }

    const pack = getMessagePack(args.language);

    try {
      // Send reminder with natural delay
      await jitterDelay(120, 300);

      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: args.chatId,
          text: pack.reminderPhone,
          reply_markup: buildContactKeyboard(args.language),
        }),
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.status}`);
      }

      // Schedule next reminder (2min intervals for phone)
      const nextDelay = 120000; // 2 minutes for subsequent reminders
      const nextJobId = await ctx.scheduler.runAfter(
        nextDelay,
        internal.scheduler.sendPhoneReminderScheduled,
        {
          leadId: lead._id,
          telegramId: args.telegramId,
          chatId: args.chatId,
          language: args.language,
          attempt: updatedLead.phonePromptAttempts + 1,
        }
      );

      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        jobIds: [nextJobId],
        nextReminderAt: Date.now() + nextDelay,
        activeReminderType: "phone",
      });

      return {
        status: "sent",
        attempt: updatedLead.phonePromptAttempts,
        nextScheduledFor: Date.now() + nextDelay,
        language: args.language,
      };

    } catch (error) {
      console.error(`Failed to send phone reminder to ${args.telegramId}:`, error);

      // Retry in 30 seconds
      const retryJobId = await ctx.scheduler.runAfter(
        30000,
        internal.scheduler.sendPhoneReminderScheduled,
        {
          leadId: lead._id,
          telegramId: args.telegramId,
          chatId: args.chatId,
          language: args.language,
          attempt: args.attempt, // Same attempt, retry
        }
      );

      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        jobIds: [retryJobId],
        nextReminderAt: Date.now() + 30000,
        activeReminderType: "phone",
      });

      return { status: "error", error: String(error), retryIn: 30000 };
    }
  },
});

// CITY REMINDER SYSTEM
export const sendCityReminderScheduled = internalAction({
  args: {
    leadId: v.id("leads"),
    telegramId: v.number(),
    chatId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Get current lead state using query (actions can't use ctx.db.get)
    const lead = await ctx.runQuery(api.greenCardBot.getLeadByTelegramId, {
      telegramId: args.telegramId,
    }) as Doc<"leads"> | null;

    if (!lead) {
      return { status: "skipped", reason: "lead not found" };
    }

    // Safety check: skip if no longer needed
    if (lead.city || lead.status === "cold" || lead.conversationStage !== "qualification") {
      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        clearJobs: true,
      });
      return { status: "skipped", reason: "no longer needed" };
    }

    // Increment attempt counter
    const updatedLead = await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId: args.telegramId,
      type: "city",
    });

    if (!updatedLead) {
      return { status: "error", reason: "failed to update lead" };
    }

    // Check if should mark as interested (after 3 attempts) - city is different: mark interested, not cold
    if (updatedLead.cityPromptAttempts >= 3) {
      await ctx.runMutation(internal.nudges.markLeadAsInterested, {
        telegramId: args.telegramId,
      });
      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        clearJobs: true,
      });
      return { status: "marked_interested", attempts: updatedLead.cityPromptAttempts };
    }

    const pack = getMessagePack(args.language);

    try {
      // Send reminder with natural delay
      await jitterDelay(120, 300);

      const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: args.chatId,
          text: pack.reminderCity,
        }),
      });

      if (!response.ok) {
        throw new Error(`Telegram API error: ${response.status}`);
      }

      // Schedule next reminder (2min intervals for city)
      const nextDelay = 120000; // 2 minutes for subsequent reminders
      const nextJobId = await ctx.scheduler.runAfter(
        nextDelay,
        internal.scheduler.sendCityReminderScheduled,
        {
          leadId: lead._id,
          telegramId: args.telegramId,
          chatId: args.chatId,
          language: args.language,
          attempt: updatedLead.cityPromptAttempts + 1,
        }
      );

      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        jobIds: [nextJobId],
        nextReminderAt: Date.now() + nextDelay,
        activeReminderType: "city",
      });

      return {
        status: "sent",
        attempt: updatedLead.cityPromptAttempts,
        nextScheduledFor: Date.now() + nextDelay,
        language: args.language,
      };

    } catch (error) {
      console.error(`Failed to send city reminder to ${args.telegramId}:`, error);

      // Retry in 30 seconds
      const retryJobId = await ctx.scheduler.runAfter(
        30000,
        internal.scheduler.sendCityReminderScheduled,
        {
          leadId: lead._id,
          telegramId: args.telegramId,
          chatId: args.chatId,
          language: args.language,
          attempt: args.attempt, // Same attempt, retry
        }
      );

      await ctx.runMutation(internal.scheduler.updateScheduledReminder, {
        leadId: lead._id,
        jobIds: [retryJobId],
        nextReminderAt: Date.now() + 30000,
        activeReminderType: "city",
      });

      return { status: "error", error: String(error), retryIn: 30000 };
    }
  },
});