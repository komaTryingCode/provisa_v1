import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Simple table to store soft leads
  soft_leads: defineTable({
    telegram_id: v.number(),
    username: v.optional(v.string()),
    first_name: v.string(),
    joined_at: v.number(),
  }).index("by_telegram_id", ["telegram_id"]),
});