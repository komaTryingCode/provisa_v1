import type { WorkflowStep } from "@convex-dev/workflow";
import type { Id } from "./_generated/dataModel";
import { workflows } from "./index";
import { workflowArgs } from "./lib/args";
import { internal } from "./_generated/api";
import type { LeadDoc } from "./workflowHelpers";

const stageOrder = ["language", "phone", "city"] as const;
type StageName = (typeof stageOrder)[number];

type StageConfig = {
  reminder: Parameters<WorkflowStep["runAction"]>[0];
  finalize: Parameters<WorkflowStep["runMutation"]>[0];
  maxAttempts: number;
  initialDelayMs: number;
  retryDelayMs: number;
  responseWindowMs: number;
};

const stageConfigs: Record<StageName, StageConfig> = {
  language: {
    reminder: internal.workflowHelpers.sendLanguageReminder,
    finalize: internal.nudges.markLeadAsCold,
    maxAttempts: 3,
    initialDelayMs: 90_000,
    retryDelayMs: 120_000,
    responseWindowMs: 60_000,
  },
  phone: {
    reminder: internal.workflowHelpers.sendPhoneReminder,
    finalize: internal.nudges.markLeadAsCold,
    maxAttempts: 3,
    initialDelayMs: 120_000,
    retryDelayMs: 120_000,
    responseWindowMs: 60_000,
  },
  city: {
    reminder: internal.workflowHelpers.sendCityReminder,
    finalize: internal.nudges.markLeadAsInterested,
    maxAttempts: 3,
    initialDelayMs: 120_000,
    retryDelayMs: 120_000,
    responseWindowMs: 60_000,
  },
};

type WorkflowContext = {
  leadId: Id<"leads">;
  telegramId: number;
  chatId: number;
  firstName: string;
};

export const leadNurturingWorkflow = workflows.define({
  args: workflowArgs,
  handler: async (step, args: WorkflowContext): Promise<void> => {
    for (const stage of stageOrder) {
      await handleStage(step, args, stage);
    }
  },
});

async function handleStage(
  step: WorkflowStep,
  context: WorkflowContext,
  stage: StageName,
): Promise<void> {
  const config = stageConfigs[stage];
  let lead = await step.runQuery(internal.workflowHelpers.getLeadState, {
    telegramId: context.telegramId,
  });

  if (!lead || stageComplete(lead, stage)) {
    return;
  }

  let delay = config.initialDelayMs;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt += 1) {
    lead = await step.runQuery(
      internal.workflowHelpers.getLeadState,
      { telegramId: context.telegramId },
      { runAfter: delay },
    );

    if (!lead || stageComplete(lead, stage)) {
      return;
    }

    const baseArgs = {
      leadId: context.leadId,
      telegramId: context.telegramId,
      chatId: context.chatId,
      attempt,
    } as Record<string, unknown>;

    if (stage !== "language") {
      if (!lead.language) {
        return;
      }
      baseArgs.language = lead.language;
    }

    await step.runAction(config.reminder, baseArgs);

    lead = await step.runQuery(
      internal.workflowHelpers.getLeadState,
      { telegramId: context.telegramId },
      { runAfter: config.responseWindowMs },
    );

    if (!lead || stageComplete(lead, stage)) {
      return;
    }

    delay = config.retryDelayMs;
  }

  await step.runMutation(config.finalize, {
    telegramId: context.telegramId,
  });
}

function stageComplete(lead: LeadDoc, stage: StageName): boolean {
  switch (stage) {
    case "language":
      return Boolean(lead.language);
    case "phone":
      return Boolean(lead.phoneNumber);
    case "city":
      return Boolean(lead.city);
    default:
      return false;
  }
}
