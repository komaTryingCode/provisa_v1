// Shared argument validators - Convex best practice
import { v } from "convex/values";

// Basic lead identifiers - used everywhere
export const leadArgs = {
  leadId: v.id("leads"),
  telegramId: v.number(),
  chatId: v.number(),
};

// Language selection - used in phone/city flows
export const languageArgs = {
  language: v.union(v.literal("uz"), v.literal("ru"), v.literal("kk")),
};

// Complete lead info for workflows
export const workflowArgs = {
  ...leadArgs,
  firstName: v.string(),
};

// Telegram message args
export const telegramArgs = {
  ...leadArgs,
  ...languageArgs,
};