import { action } from "./_generated/server";
import { v } from "convex/values";
import { sendChatAction } from "./lib/telegram";

export const showTyping = action({
  args: {
    chatId: v.number(),
  },
  handler: async (_ctx, args) => {
    await sendChatAction({ chatId: args.chatId, action: "typing" });
    return { ok: true };
  },
});
