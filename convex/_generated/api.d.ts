/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as bot from "../bot.js";
import type * as greenCardBot from "../greenCardBot.js";
import type * as http from "../http.js";
import type * as messageUtils from "../messageUtils.js";
import type * as nudges from "../nudges.js";
import type * as scheduler from "../scheduler.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  bot: typeof bot;
  greenCardBot: typeof greenCardBot;
  http: typeof http;
  messageUtils: typeof messageUtils;
  nudges: typeof nudges;
  scheduler: typeof scheduler;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
