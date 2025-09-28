import { mutation, action, internalMutation, internalAction } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { neutral } from "../autoResponses/neutral";
import { getMessagePack, buildLanguageKeyboard, buildContactKeyboard } from "./messageUtils";

// Internal mutation to increment reminder counters
export const incrementReminderCounter = internalMutation({
  args: {
    telegramId: v.number(),
    type: v.union(v.literal("language"), v.literal("phone"), v.literal("city")),
  },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();

    if (!lead) return null;

    const updates: any = { lastContactAt: Date.now() };

    switch (args.type) {
      case "language":
        updates.languagePromptAttempts = lead.languagePromptAttempts + 1;
        break;
      case "phone":
        updates.phonePromptAttempts = lead.phonePromptAttempts + 1;
        break;
      case "city":
        updates.cityPromptAttempts = lead.cityPromptAttempts + 1;
        break;
    }

    await ctx.db.patch(lead._id, updates);
    return { ...lead, ...updates };
  },
});

// Internal mutation to set lead as cold
export const markLeadAsCold = internalMutation({
  args: { telegramId: v.number() },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();

    if (!lead) return null;

    await ctx.db.patch(lead._id, {
      status: "cold",
      lastContactAt: Date.now(),
    });

    return lead;
  },
});

// Internal mutation to set lead as interested
export const markLeadAsInterested = internalMutation({
  args: { telegramId: v.number() },
  handler: async (ctx, args) => {
    const lead = await ctx.db
      .query("leads")
      .filter((q) => q.eq(q.field("telegramId"), args.telegramId))
      .first();

    if (!lead) return null;

    await ctx.db.patch(lead._id, {
      status: "interested",
      lastContactAt: Date.now(),
    });

    return lead;
  },
});

// Internal action to send language reminder
export const sendLanguageReminder = internalAction({
  args: {
    chatId: v.number(),
    telegramId: v.number(),
    attempt: v.number(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Update counter
    const lead = await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId: args.telegramId,
      type: "language",
    });

    if (!lead) return { error: "Lead not found" };

    let message = neutral.reminderLanguage;

    // After 5 minutes total (multiple attempts), mark as cold
    if (lead.languagePromptAttempts >= 3) {
      await ctx.runMutation(internal.nudges.markLeadAsCold, {
        telegramId: args.telegramId,
      });
      return { status: "marked_cold" };
    }

    // Send reminder with typing
    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });

    const delay = Math.floor(Math.random() * 1000) + 500;
    await new Promise(resolve => setTimeout(resolve, delay));

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
      throw new Error(`Failed to send language reminder: ${response.status}`);
    }

    return await response.json();
  },
});

// Internal action to send phone reminder
export const sendPhoneReminder = internalAction({
  args: {
    chatId: v.number(),
    telegramId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args): Promise<any> => {
    // Update counter
    const lead = await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId: args.telegramId,
      type: "phone",
    });

    if (!lead) return { error: "Lead not found" };

    // After 5 minutes total, mark as cold
    if (lead.phonePromptAttempts >= 3) {
      await ctx.runMutation(internal.nudges.markLeadAsCold, {
        telegramId: args.telegramId,
      });
      return { status: "marked_cold" };
    }

    const pack = getMessagePack(args.language);

    // Send reminder with typing
    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });

    const delay = Math.floor(Math.random() * 1000) + 500;
    await new Promise(resolve => setTimeout(resolve, delay));

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
      throw new Error(`Failed to send phone reminder: ${response.status}`);
    }

    return await response.json();
  },
});

// Internal action to send city reminder
export const sendCityReminder = internalAction({
  args: {
    chatId: v.number(),
    telegramId: v.number(),
    language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
  },
  handler: async (ctx, args): Promise<any> => {
    // Update counter
    const lead = await ctx.runMutation(internal.nudges.incrementReminderCounter, {
      telegramId: args.telegramId,
      type: "city",
    });

    if (!lead) return { error: "Lead not found" };

    // After 5 minutes total, set as interested (not cold, as they've shown engagement)
    if (lead.cityPromptAttempts >= 3) {
      // Use mutation to update status
      await ctx.runMutation(internal.nudges.markLeadAsInterested, {
        telegramId: args.telegramId,
      });
      return { status: "marked_interested" };
    }

    const pack = getMessagePack(args.language);

    // Send reminder with typing
    await ctx.runAction(api.bot.showTyping, { chatId: args.chatId });

    const delay = Math.floor(Math.random() * 1000) + 500;
    await new Promise(resolve => setTimeout(resolve, delay));

    const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: args.chatId,
        text: pack.reminderCity,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send city reminder: ${response.status}`);
    }

    return await response.json();
  },
});

// Internal query to find leads needing language reminders
export const getLanguageReminderLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("leads")
      .filter((q) =>
        q.and(
          q.eq(q.field("conversationStage"), "greeting"),
          q.eq(q.field("language"), undefined),
          q.lt(q.field("lastContactAt"), now - 90000), // 90 seconds ago
          q.lt(q.field("languagePromptAttempts"), 3), // Less than 3 attempts
          q.neq(q.field("status"), "cold")
        )
      )
      .collect();
  },
});

// Internal query to find leads needing phone reminders
export const getPhoneReminderLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("leads")
      .filter((q) =>
        q.and(
          q.eq(q.field("conversationStage"), "language_selection"),
          q.eq(q.field("phoneNumber"), undefined),
          q.lt(q.field("lastContactAt"), now - 120000), // 2 minutes ago
          q.lt(q.field("phonePromptAttempts"), 3),
          q.neq(q.field("status"), "cold")
        )
      )
      .collect();
  },
});

// Internal query to find leads needing city reminders
export const getCityReminderLeads = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    return await ctx.db
      .query("leads")
      .filter((q) =>
        q.and(
          q.eq(q.field("conversationStage"), "qualification"),
          q.neq(q.field("phoneNumber"), undefined),
          q.eq(q.field("city"), undefined),
          q.lt(q.field("lastContactAt"), now - 120000), // 2 minutes ago
          q.lt(q.field("cityPromptAttempts"), 3)
        )
      )
      .collect();
  },
});

// Scheduled function to process reminder nudges
export const processReminders = action({
  args: {},
  handler: async (ctx): Promise<{
    languageReminders: number;
    phoneReminders: number;
    cityReminders: number;
  }> => {
    // Get leads that need reminders using explicit type annotations
    const languageReminders: any[] = await ctx.runMutation(internal.nudges.getLanguageReminderLeads, {});
    const phoneReminders: any[] = await ctx.runMutation(internal.nudges.getPhoneReminderLeads, {});
    const cityReminders: any[] = await ctx.runMutation(internal.nudges.getCityReminderLeads, {});

    // Process language reminders
    for (const lead of languageReminders) {
      try {
        await ctx.runAction(internal.nudges.sendLanguageReminder, {
          chatId: lead.telegramId,
          telegramId: lead.telegramId,
          attempt: lead.languagePromptAttempts + 1,
        });
      } catch (error) {
        console.error(`Failed to send language reminder to ${lead.telegramId}:`, error);
      }
    }

    // Process phone reminders
    for (const lead of phoneReminders) {
      if (lead.language) {
        try {
          await ctx.runAction(internal.nudges.sendPhoneReminder, {
            chatId: lead.telegramId,
            telegramId: lead.telegramId,
            language: lead.language,
          });
        } catch (error) {
          console.error(`Failed to send phone reminder to ${lead.telegramId}:`, error);
        }
      }
    }

    // Process city reminders
    for (const lead of cityReminders) {
      if (lead.language) {
        try {
          await ctx.runAction(internal.nudges.sendCityReminder, {
            chatId: lead.telegramId,
            telegramId: lead.telegramId,
            language: lead.language,
          });
        } catch (error) {
          console.error(`Failed to send city reminder to ${lead.telegramId}:`, error);
        }
      }
    }

    return {
      languageReminders: languageReminders.length,
      phoneReminders: phoneReminders.length,
      cityReminders: cityReminders.length,
    };
  },
});