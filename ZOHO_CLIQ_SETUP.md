# Zoho Cliq Two-Way Integration Setup Guide

To enable full two-way communication between the Job Management System and Zoho Cliq, follow these steps.

## 1. App to Zoho Cliq (Outgoing Messages)

This part is handled by the application using Zoho OAuth.

1.  **Create a Zoho API Console Application**:
    - Go to [Zoho API Console](https://api-console.zoho.com.au/) (or .com depending on your region).
    - Create a new **Server-based Application**.
    - Set the **Redirect URI** to `https://your-app-domain.com/api/zoho/callback`.
    - Copy the **Client ID** and **Client Secret**.

2.  **Configure Environment Variables**:
    - Update your server's `.env` file with:
      - `ZOHO_CLIENT_ID`
      - `ZOHO_CLIENT_SECRET`
      - `ZOHO_REDIRECT_URI`
      - `ZOHO_CLIQ_SYNC_SECRET` (A random string you choose)

3.  **Perform OAuth Consent**:
    - Log in to your application as an Admin.
    - Navigate to `https://your-app-domain.com/api/zoho/oauth/start`.
    - Complete the Zoho consent flow.
    - Copy the `refreshToken` shown on the success page into your `.env` as `ZOHO_CLIQ_REFRESH_TOKEN`.
    - Restart your API server.

---

## 2. Zoho Cliq to App (Incoming Messages)

To sync messages from Zoho Cliq back to the application, you must configure a **Bot** or **Message Handler** in Zoho Cliq.

1.  **Create a Bot in Zoho Cliq**:
    - Open Zoho Cliq and go to **Settings > Customization > Bots**.
    - Click **Create Bot**.
    - Give it a name (e.g., "Job Manager Sync").

2.  **Configure the Message Handler**:
    - In the Bot configuration, go to the **Handlers** tab.
    - Edit the **Message Handler**.
    - Use the following Deluge script to forward messages to your application:

```deluge
// Replace with your actual domain and secret
endpointUrl = "https://your-app-domain.com/api/zoho/cliq/messages/incoming";
secret = "your-configured-ZOHO_CLIQ_SYNC_SECRET";

payload = Map();
payload.put("channelName", channel.get("name"));
payload.put("text", message.get("text"));
payload.put("senderEmail", user.get("email"));
payload.put("senderName", user.get("first_name") + " " + user.get("last_name"));
payload.put("externalMessageId", message.get("id"));

header = Map();
header.put("x-cliq-sync-secret", secret);

response = invokeurl
[
	url :endpointUrl
	type :POST
	parameters :payload.toString()
	headers :header
];

return Map();
```

3.  **Add Bot to Channels**:
    - Ensure the Bot is added to the channels created by the application.
    - When the application creates a channel for a job, it will automatically use the channel name to map incoming messages back to the correct job.

---

## Troubleshooting

- **Secret Mismatch**: Ensure the `secret` in the Deluge script exactly matches `ZOHO_CLIQ_SYNC_SECRET` in your `.env`.
- **Channel Name**: The application maps messages using the Zoho Cliq `unique_name` of the channel. Do not change channel names manually in Zoho Cliq.
- **Duplicate Messages**: The application automatically filters out messages that were originally sent from the app to Cliq to prevent infinite loops.
