# Backend Logic Overview

## High-Level Architecture

The backend is built on [Convex](https://docs.convex.dev) and orchestrates a Telegram funnel for the Provisa Green Card consultation bot. It consists of:

- Convex schema `/convex/schema.ts` defining the `leads` table (indexed by `telegramId`, `status`, `conversationStage`, and `nextFollowUpAt`).
- HTTP entry point `/convex/http.ts` exposing a Telegram webhook (`/telegram/webhook`) and a simple health check.
- Mutations and actions in `/convex/greenCardBot.ts` for lead lifecycle operations and outbound bot messaging.
- A workflow-driven reminder system (`/convex/workflows.ts` + `/convex/index.ts`) implemented with [`@convex-dev/workflow`](https://www.convex.dev/components/workflow).
- Internal helpers for reminder counters and lead state (`/convex/nudges.ts`, `/convex/workflowHelpers.ts`).
- A shared Telegram client wrapper `/convex/lib/telegram.ts` handling all API calls.

## Request Flow

1. **Telegram Webhook** (`/convex/http.ts`)
   - Validates POST bodies and logs a minimal summary. Non-POST requests return 405.
   - Routes message updates to `handleMessage`, callback queries to `handleCallbackQuery`.

2. **Message Handling** (`handleMessage`)
   - `/start` command invokes `api.greenCardBot.handleStart`, which creates/updates a lead and triggers the workflow if new.
   - Contact shares or manual phone input update lead data via mutations and trigger the next bot action.
   - City responses transition to the final message once captured.

3. **Callback Handling** (`handleCallbackQuery`)
   - Language selection runs `handleLanguageSelection` and prompts for phone submission.
   - Acks the callback via `answerCallbackQuery` to clear Telegram loading states.

## Lead Lifecycle Mutations (`/convex/greenCardBot.ts`)

- `handleStart`: Inserts or updates a lead, then starts `leadNurturingWorkflow` via `internal.workflows.leadNurturingWorkflow` when a new lead is created. Debounces repeated `/start` commands within 30 seconds.
- `handleLanguageSelection`, `handlePhoneCapture`, `handleCityCapture`: Update the lead and transition stages (`greeting` ? `language_selection` ? `qualification` ? `interest_building`).
- Query: `getLeadByTelegramId` for fetching lead state within HTTP handlers.
- Actions: `sendGreeting`, `sendPhoneRequest`, `sendCityRequest`, `sendFinalMessage` use the shared Telegram client to send localized messages.

## Reminder Workflow (`/convex/index.ts`, `/convex/workflows.ts`)

We use [`@convex-dev/workflow`](https://www.convex.dev/components/workflow) to reliably nudge leads. Setup:

- `convex/index.ts` instantiates a `WorkflowManager` bound to the installed workflow component (registered in `convex/convex.config.ts`).
- `leadNurturingWorkflow`: Loops through stages (`language`, `phone`, `city`). For each stage the workflow:
  1. Waits `initialDelayMs` (e.g., 90s for language).
  2. Checks if the stage is complete via `internal.workflowHelpers.getLeadState`.
  3. Sends a reminder action (`sendLanguageReminder`, `sendPhoneReminder`, `sendCityReminder`) and increments counters via `internal.nudges.incrementReminderCounter`.
  4. Waits `responseWindowMs` before re-checking. Retries up to `maxAttempts`, then finalizes the lead (`markLeadAsCold` or `markLeadAsInterested`).

This workflow ensures durable, resumable reminder scheduling without manual timers.

## Supporting Modules

- `/convex/nudges.ts`: Internal mutations for reminder counters and lead status transitions (`markLeadAsCold`, `markLeadAsInterested`).
- `/convex/workflowHelpers.ts`: Internal queries/actions used by the workflow to read lead state and send reminders via the Telegram client.
- `/convex/lib/telegram.ts`: Shared client with `sendMessage`, `answerCallbackQuery`, `sendChatAction`, providing consistent error handling.
- `/convex/bot.ts`: Simple `showTyping` action calling `sendChatAction`.
- `/convex/messageUtils.ts`: Keyboard builders, phone normalization, etc.

## Data Schema

`/convex/schema.ts` defines the `leads` table with metadata used throughout the workflow (prompt attempts, next follow-up time). Indexes enable efficient lookup by Telegram ID and stage.

## Localization

Messages for each language live in `/autoResponses/*.ts`. Each file exports a named object (no anonymous default exports) with strings for the funnel.

## Configuration

`convex/convex.config.ts` installs the workflow component. Telemetry or additional components can be added here.

## Environment & Secrets

Telegram token and other secrets are pulled from environment variables (e.g., `TELEGRAM_BOT_TOKEN`). Production deployment should rely on Convex secrets management (`convex env set`) instead of `.env.local`.

## Development Commands

- Regenerate Convex metadata and bindings: `npx convex dev --once` (rebuilds `_generated` files).
- Lint: `npm run lint`

## Documentation References

- Convex workflows: https://www.convex.dev/components/workflow
- Trigger best practices: https://stack.convex.dev/triggers
- Argument validation helpers: https://stack.convex.dev/argument-validation-without-repetition
- General Convex docs: https://docs.convex.dev

