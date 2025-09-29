import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Comprehensive lead management table
  leads: defineTable({
    // Identity fields
    telegramId: v.number(),
    firstName: v.string(),
    lastName: v.optional(v.string()),
    username: v.optional(v.string()),
    isBot: v.optional(v.boolean()),

    // Preferences
    language: v.optional(v.union(v.literal("uz"), v.literal("ru"), v.literal("kk"))),

    // Contact/location
    phoneNumber: v.optional(v.string()),
    city: v.optional(v.string()),

    // Status & stage
    status: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("interested"),
      v.literal("cold")
    ),
    conversationStage: v.union(
      v.literal("greeting"),
      v.literal("language_selection"),
      v.literal("qualification"),
      v.literal("interest_building")
    ),

    // Timestamps
    createdAt: v.number(),
    lastContactAt: v.number(),
    nextFollowUpAt: v.optional(v.number()),

    // Counters for reminders
    languagePromptAttempts: v.number(),
    phonePromptAttempts: v.number(),
    cityPromptAttempts: v.number(),

    // Source tracking
    source: v.optional(v.string()), // e.g., "referral", "direct"
    referralCode: v.optional(v.string()),

    // Last interaction tracking for debounce
    lastStartTime: v.optional(v.number()),

    // On-demand scheduling support
    scheduledReminderIds: v.optional(v.array(v.id("_scheduled_functions"))),
    nextReminderAt: v.optional(v.number()),
    activeReminderType: v.optional(v.union(
      v.literal("language"),
      v.literal("phone"),
      v.literal("city")
    )),
  })
    .index("by_telegram_id", ["telegramId"])
    .index("by_status", ["status"])
    .index("by_conversation_stage", ["conversationStage"])
    .index("by_next_followup", ["nextFollowUpAt"]),
});