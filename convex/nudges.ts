import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";

type LeadDoc = Doc<"leads">;

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

    const updates: Partial<LeadDoc> & { lastContactAt: number } = { lastContactAt: Date.now() };

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