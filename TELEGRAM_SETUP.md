# Telegram Bot Setup with Convex

This guide explains how to set up a Telegram bot that connects to your Convex backend using webhooks.

## Prerequisites

1. **Telegram Bot**: Create a bot using [@BotFather](https://t.me/botfather) on Telegram
2. **Convex Account**: Set up at [convex.dev](https://convex.dev)
3. **Deployed Convex App**: Your Convex functions need to be deployed

## Setup Steps

### 1. Create a Telegram Bot

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow the instructions
3. Save the bot token (format: `123456789:ABCdef...`)

### 2. Configure Environment Variables

1. Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```

2. Add your bot token:
   ```
   TELEGRAM_BOT_TOKEN=your_actual_bot_token_here
   ```

### 3. Deploy Convex Functions

Make sure your Convex functions are deployed:

```bash
npx convex deploy
```

### 4. Set Up the Webhook

After deploying, you'll need to tell Telegram where to send updates. Your webhook URL will be:

```
https://your-convex-deployment.convex.site/telegram/webhook
```

You can set this webhook using the Convex dashboard or by calling the `setWebhook` action.

#### Option A: Using Convex Dashboard

1. Go to your Convex dashboard
2. Navigate to Functions
3. Run the `telegramUtils:setWebhook` action with:
   ```json
   {
     "webhookUrl": "https://your-convex-deployment.convex.site/telegram/webhook"
   }
   ```

#### Option B: Using curl

```bash
curl -X POST "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/setWebhook" \
     -H "Content-Type: application/json" \
     -d '{"url": "https://your-convex-deployment.convex.site/telegram/webhook"}'
```

### 5. Test Your Bot

1. Find your bot on Telegram (search for the username you gave it)
2. Send `/start` to begin the conversation
3. Try sending messages and commands

## Available Commands

- `/start` - Initialize the bot and get a welcome message
- `/help` - Show available commands
- Any text message - Echo bot functionality

## File Structure

```
convex/
├── schema.ts              # Database schema for Telegram data
├── telegram.ts            # HTTP action for webhook endpoint
├── telegramMutations.ts   # Functions to process Telegram updates
└── telegramUtils.ts       # Utility functions for Telegram API calls
```

## Database Tables

The bot creates the following tables in your Convex database:

- `telegram_updates` - Raw webhook updates from Telegram
- `telegram_users` - User information and registration data
- `telegram_messages` - Individual messages with metadata
- `bot_config` - Bot configuration settings

## Troubleshooting

### Check Webhook Status

You can check if your webhook is properly configured:

```bash
curl "https://api.telegram.org/bot<YOUR_BOT_TOKEN>/getWebhookInfo"
```

### Common Issues

1. **Webhook not receiving updates**: Ensure your Convex deployment is live and the URL is correct
2. **Bot not responding**: Check the Convex logs for errors
3. **Database errors**: Ensure your schema is properly deployed

### Logs

Monitor your bot's activity in the Convex dashboard under "Logs" to see:
- Incoming webhook requests
- Message processing
- API call responses
- Any errors

## Security Considerations

1. **Environment Variables**: Never commit your bot token to version control
2. **Webhook Security**: Consider implementing webhook validation using Telegram's secret token
3. **Rate Limiting**: Implement rate limiting for user messages if needed

## Next Steps

- Customize message handlers in `telegramMutations.ts`
- Add more bot commands
- Implement user authentication
- Add rich message formatting (buttons, inline keyboards)
- Integrate with other services