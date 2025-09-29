import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Helper to start workflow for a lead
export const startWorkflowForLead = internalMutation({
  args: {
    leadId: v.id("leads"),
    telegramId: v.number(),
    firstName: v.string(),
  },
  handler: async (ctx, { leadId, telegramId, firstName }) => {
    // Get the chat ID from the lead record
    const lead = await ctx.db.get(leadId);
    if (!lead) {
      throw new Error(`Lead ${leadId} not found`);
    }

    // Start the workflow with the lead data using scheduler
    // chatId = telegramId for direct messages in Telegram
    await ctx.scheduler.runAfter(0, internal.workflows.leadNurturingWorkflow, {
      leadId,
      telegramId,
      chatId: telegramId,
      firstName,
    });

    console.log(`Started nurturing workflow for lead ${telegramId} (${firstName})`);
    return { workflowStarted: true };
  },
});