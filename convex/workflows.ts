import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { workflowArgs } from "./lib/args";
import { v } from "convex/values";

// Main workflow entry point - starts the nurturing sequence
export const leadNurturingWorkflow = internalAction({
  args: workflowArgs,
  handler: async (ctx, { leadId, telegramId, chatId, firstName }) => {
    console.log(`🚀 Starting workflow for lead ${telegramId}`);

    // Start with language stage after 90 seconds
    await ctx.scheduler.runAfter(
      90 * 1000,
      internal.workflows.processStage,
      {
        leadId,
        telegramId,
        chatId,
        firstName,
        stage: "language",
        attempt: 1
      }
    );
  },
});

// Generic stage processor - handles all stages with consistent logic
export const processStage = internalAction({
  args: {
    ...workflowArgs,
    stage: v.union(v.literal("language"), v.literal("phone"), v.literal("city")),
    attempt: v.number(),
  },
  handler: async (ctx, { leadId, telegramId, chatId, firstName, stage, attempt }) => {
    console.log(`📍 Processing ${stage} stage, attempt ${attempt} for lead ${telegramId}`);

    // Get current lead state
    const lead = await ctx.runQuery(internal.workflowHelpers.getLeadState, { telegramId });

    if (!lead) {
      console.error(`❌ Lead ${telegramId} not found`);
      return;
    }

    if (lead.status === "cold") {
      console.log(`❄️ Lead ${telegramId} is cold, stopping workflow`);
      return;
    }

    // Check if stage is completed and move to next
    if (await isStageCompleted(lead, stage)) {
      console.log(`✅ Stage ${stage} completed for lead ${telegramId}`);
      await scheduleNextStage(ctx, { leadId, telegramId, chatId, firstName }, stage);
      return;
    }

    // Send reminder for current stage
    await sendStageReminder(ctx, { leadId, telegramId, chatId, firstName }, stage, attempt, lead);

    // Schedule next attempt or finalization
    if (attempt < 2) {
      // Schedule next attempt
      await ctx.scheduler.runAfter(
        2 * 60 * 1000, // 2 minutes
        internal.workflows.processStage,
        { leadId, telegramId, chatId, firstName, stage, attempt: attempt + 1 }
      );
    } else {
      // Final attempt - schedule finalization
      await ctx.scheduler.runAfter(
        2 * 60 * 1000, // 2 minutes
        internal.workflows.finalizeStage,
        { leadId, telegramId, chatId, firstName, stage }
      );
    }
  },
});

// Finalize stage - mark lead as cold or interested
export const finalizeStage = internalAction({
  args: {
    ...workflowArgs,
    stage: v.union(v.literal("language"), v.literal("phone"), v.literal("city")),
  },
  handler: async (ctx, { leadId, telegramId, chatId, firstName, stage }) => {
    console.log(`🏁 Finalizing ${stage} stage for lead ${telegramId}`);

    const lead = await ctx.runQuery(internal.workflowHelpers.getLeadState, { telegramId });

    if (!lead) {
      console.error(`❌ Lead ${telegramId} not found`);
      return;
    }

    // Check if stage was completed in the meantime
    if (await isStageCompleted(lead, stage)) {
      console.log(`✅ Stage ${stage} completed during finalization for lead ${telegramId}`);
      await scheduleNextStage(ctx, { leadId, telegramId, chatId, firstName }, stage);
      return;
    }

    // Mark lead based on stage
    if (stage === "city") {
      // City stage failure = interested (they provided phone at least)
      console.log(`📞 Marking lead ${telegramId} as interested (provided phone but not city)`);
      await ctx.runMutation(internal.nudges.markLeadAsInterested, { telegramId });
    } else {
      // Language or phone stage failure = cold
      console.log(`❄️ Marking lead ${telegramId} as cold (failed ${stage} stage)`);
      await ctx.runMutation(internal.nudges.markLeadAsCold, { telegramId });
    }
  },
});

// Helper functions (not exported, used internally)
async function isStageCompleted(lead: any, stage: string): Promise<boolean> {
  switch (stage) {
    case "language":
      return !!lead.language;
    case "phone":
      return !!lead.phoneNumber;
    case "city":
      return !!lead.city;
    default:
      return false;
  }
}

async function scheduleNextStage(
  ctx: any,
  leadInfo: { leadId: string; telegramId: number; chatId: number; firstName: string },
  currentStage: string
) {
  const nextStage = getNextStage(currentStage);
  if (!nextStage) {
    console.log(`🎉 Workflow complete for lead ${leadInfo.telegramId}`);
    return;
  }

  console.log(`➡️ Moving to ${nextStage} stage for lead ${leadInfo.telegramId}`);
  await ctx.scheduler.runAfter(
    2 * 60 * 1000, // 2 minutes between stages
    internal.workflows.processStage,
    { ...leadInfo, stage: nextStage, attempt: 1 }
  );
}

function getNextStage(currentStage: string): string | null {
  switch (currentStage) {
    case "language":
      return "phone";
    case "phone":
      return "city";
    case "city":
      return null; // Workflow complete
    default:
      return null;
  }
}

async function sendStageReminder(
  ctx: any,
  leadInfo: { leadId: string; telegramId: number; chatId: number; firstName: string },
  stage: string,
  attempt: number,
  lead: any
) {
  const { leadId, telegramId, chatId } = leadInfo;

  try {
    switch (stage) {
      case "language":
        await ctx.runAction(internal.workflowHelpers.sendLanguageReminder, {
          leadId, telegramId, chatId, attempt
        });
        break;
      case "phone":
        if (!lead.language) {
          console.error(`❌ Cannot send phone reminder - lead ${telegramId} has no language`);
          return;
        }
        await ctx.runAction(internal.workflowHelpers.sendPhoneReminder, {
          leadId, telegramId, chatId, language: lead.language, attempt
        });
        break;
      case "city":
        if (!lead.language) {
          console.error(`❌ Cannot send city reminder - lead ${telegramId} has no language`);
          return;
        }
        await ctx.runAction(internal.workflowHelpers.sendCityReminder, {
          leadId, telegramId, chatId, language: lead.language, attempt
        });
        break;
    }
    console.log(`📧 Sent ${stage} reminder (attempt ${attempt}) to lead ${telegramId}`);
  } catch (error) {
    console.error(`❌ Failed to send ${stage} reminder to lead ${telegramId}:`, error);
  }
}