// Simple trigger simulation using direct mutation calls
// This approach achieves the same workflow triggering without complex trigger setup

import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// This will be called manually from greenCardBot when a new lead is created
export const onNewLead = internalMutation({
  args: {
    leadId: v.id("leads"),
    telegramId: v.number(),
    firstName: v.string(),
  },
  handler: async (ctx, { leadId, telegramId, firstName }) => {
    // Only start workflow for new leads without language
    const lead = await ctx.db.get(leadId);
    if (!lead?.language) {
      // Start the complete nurturing workflow
      await ctx.runMutation(internal.triggerHelpers.startWorkflowForLead, {
        leadId,
        telegramId,
        firstName,
      });
      console.log(`Workflow started for new lead ${telegramId} (${firstName})`);
    }
  },
});

// This will be called when user data changes (optional analytics)
export const onLeadUpdate = internalMutation({
  args: {
    leadId: v.id("leads"),
    oldData: v.any(),
    newData: v.any(),
  },
  handler: async (ctx, { oldData, newData }) => {
    // Log user progression for analytics
    if (!oldData.language && newData.language) {
      console.log(`Lead ${newData.telegramId} selected language: ${newData.language}`);
    }
    if (!oldData.phoneNumber && newData.phoneNumber) {
      console.log(`Lead ${newData.telegramId} provided phone`);
    }
    if (!oldData.city && newData.city) {
      console.log(`Lead ${newData.telegramId} provided city - fully qualified!`);
    }
  },
});