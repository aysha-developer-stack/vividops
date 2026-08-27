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
    - Use the following Deluge script to forward messages (including **file attachments**) to your application:

```deluge
// Replace with your actual domain and secret
endpointUrl = "https://your-app-domain.com/api/zoho/cliq/messages/incoming";
secret = "your-configured-ZOHO_CLIQ_SYNC_SECRET";

payload = Map();
payload.put("channelName", channel.get("name"));
channelId = ifnull(channel.get("id"), ifnull(channel.get("channel_id"), ""));
if(channelId != "")
{
	payload.put("channelId", channelId);
}

msgText = ifnull(message.get("text"), "");
msgType = ifnull(message.get("type"), "");
payload.put("messageType", msgType);
payload.put("message", message);

// Cliq FILE messages (attachments in channel) — text alone is often empty or "updated file".
if(msgType.equalsIgnoreCase("file"))
{
	content = message.get("content");
	if(content != null)
	{
		fileObj = content.get("file");
		if(fileObj != null)
		{
			payload.put("file", fileObj);
			fileId = ifnull(fileObj.get("id"), "");
			fileName = ifnull(fileObj.get("name"), "attachment");
			if(fileId != "")
			{
				payload.put("fileId", fileId);
				payload.put("fileName", fileName);
			}
			comment = ifnull(content.get("comment"), "");
			if(comment != "")
			{
				msgText = comment;
			}
		}
	}
}

// Handler-level attachments array (when user uploads files to the bot in channel).
if(attachments != null && attachments.size() > 0)
{
	payload.put("attachments", attachments);
}

if(msgText == "" && (payload.containsKey("fileId") || attachments != null))
{
	msgText = "Shared a file";
}
payload.put("text", msgText);
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

**Why this matters for attachments:** When someone uploads a file in a Cliq channel, Cliq sends a `file` message type with `message.content.file` (`id` + `name`), not a public download URL. The old script only forwarded `message.get("text")`, so OPS often received `"updated file"` with no file metadata and could not show a preview. The script above forwards the file id/name so OPS can proxy and display the attachment.

3.  **Add Bot to Channels**:
    - Ensure the Bot is added to the channels created by the application.
    - When the application creates a channel for a job, it will automatically use the channel name to map incoming messages back to the correct job.

---

## Troubleshooting

- **Secret Mismatch**: Ensure the `secret` in the Deluge script exactly matches `ZOHO_CLIQ_SYNC_SECRET` in your `.env`.
- **Channel Name**: The application maps messages using the Zoho Cliq `unique_name` of the channel. Do not change channel names manually in Zoho Cliq.
- **Duplicate Messages**: The application automatically filters out messages that were originally sent from the app to Cliq to prevent infinite loops.
- **Attachments not showing in OPS**: Update the Deluge Message Handler to the script above, redeploy the API (includes `/api/cliq/files/:id/view` proxy), then post a **new** file in Cliq. Older synced rows may only show `"updated file"` unless they had file metadata stored in the webhook payload.
