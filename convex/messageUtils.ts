// Utility functions for message handling and keyboards

import { neutral } from "../autoResponses/neutral";
import uzbPack from "../autoResponses/uzb";
import rusPack from "../autoResponses/rus";
import kkPack from "../autoResponses/kk";

// Type definitions
type Language = "uz" | "ru" | "kk";
type MessagePack = typeof uzbPack;

// Get message pack by language with fallback to Uzbek
export function getMessagePack(language?: Language): MessagePack {
  switch (language) {
    case "ru":
      return rusPack;
    case "kk":
      return kkPack;
    case "uz":
    default:
      return uzbPack;
  }
}

// Build language selection inline keyboard
export function buildLanguageKeyboard() {
  return {
    inline_keyboard: [
      [
        { text: neutral.languageButtons.uz, callback_data: "lang_uz" },
        { text: neutral.languageButtons.ru, callback_data: "lang_ru" },
      ],
      [
        { text: neutral.languageButtons.kk, callback_data: "lang_kk" },
      ],
    ],
  };
}

// Build contact request keyboard
export function buildContactKeyboard(language?: Language) {
  const pack = getMessagePack(language);

  return {
    keyboard: [
      [
        {
          text: pack.contactButton,
          request_contact: true,
        },
      ],
    ],
    resize_keyboard: true,
    one_time_keyboard: true,
  };
}

// Remove keyboard (for regular text input)
export function removeKeyboard() {
  return {
    remove_keyboard: true,
  };
}

// Parse /start command payload
export function parseStartPayload(text: string) {
  const result: {
    language?: Language;
    source?: string;
    referralCode?: string;
  } = {};

  // Extract payload after /start
  const payload = text.replace("/start", "").trim();
  if (!payload) return result;

  // Parse language shortcuts
  if (payload.includes("lang_uz")) {
    result.language = "uz";
  } else if (payload.includes("lang_ru")) {
    result.language = "ru";
  } else if (payload.includes("lang_kk")) {
    result.language = "kk";
  }

  // Parse referral codes
  const refMatch = payload.match(/ref_(\w+)/);
  if (refMatch) {
    result.source = "referral";
    result.referralCode = refMatch[1];
  }

  return result;
}

// Normalize phone number (basic cleanup)
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except +
  let normalized = phone.replace(/[^\d+]/g, "");

  // Ensure it starts with + if it's an international number
  if (normalized.length > 10 && !normalized.startsWith("+")) {
    normalized = "+" + normalized;
  }

  return normalized;
}

// Check if input looks like a phone number
export function isPhoneNumber(text: string): boolean {
  // Basic phone validation - contains mostly digits and is long enough
  const digitsOnly = text.replace(/[^\d]/g, "");
  return digitsOnly.length >= 7 && /[\d\s\-\+\(\)]{7,}/.test(text);
}
