# Debug Session: cliq-push-failure
- **Status**: [OPEN]
- **Issue**: Website messages are saved successfully, but they do not appear in Zoho Cliq. Runtime logs show `[CLIQ-PUSH] Attempting to push message to Zoho Cliq`, then API push failure, then webhook fallback failure.
- **Debug Server**: Not started yet
- **Log File**: .dbg/trae-debug-log-cliq-push-failure.ndjson

## Reproduction Steps
1. Open `https://vividops.com.au/super-admin/communication`.
2. Send a message for a job with `pushToCliq: true`.
3. Observe browser `POST /api/jobs/:id/messages` returns `201 Created`.
4. Observe backend logs:
5. `[CLIQ-PUSH] Attempting to push message to Zoho Cliq`
6. `[CLIQ-PUSH] API push failed, falling back to webhook`
7. `[CLIQ-PUSH] Failed to send message via both API and Webhook`

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | Production Zoho OAuth token or scopes are invalid, so API send fails before webhook fallback | High | Low | Pending |
| B | `ZOHO_CLIQ_WEBHOOK_URL` in production is missing `?zapikey=...`, so webhook fallback is unauthorized | High | Low | Confirmed |
| C | The bot lacks a configured Incoming Webhook Handler, so `/incoming` accepts the request but does not create a visible Cliq message | High | Low | Suspected |
| D | Production env values differ from local `.env`, so live server uses stale Zoho config | High | Low | Pending |
| E | Cliq channel/bot provisioning is incomplete for the production org, so both API and webhook targets reject delivery | Medium | Medium | Pending |

## Log Evidence
- Browser request to production API returns `201 Created`.
- Backend logs confirm the `pushToCliq` path executes.
- Backend logs confirm both API send and webhook fallback fail.
- New production log evidence:
- `[CLIQ-PUSH] Attempting to push message to Zoho Cliq`
- `[CLIQ-PUSH] API push failed, falling back to webhook`
- `[CLIQ-PUSH] Successfully pushed message via Webhook fallback`
- User also confirmed the Zoho bot/API connection is not established yet.

## Verification Conclusion
- Hypothesis B is confirmed: webhook delivery works after correcting the webhook path/token in production.
- Hypothesis A is strongly supported: direct Zoho API push still fails and falls back to webhook, and the Zoho connection is not established yet.
- User reported the message is still missing in Cliq even though webhook fallback now succeeds.
- Most likely next root cause is Hypothesis C: the bot webhook endpoint is active but not configured with an Incoming Webhook Handler that returns a displayable Cliq message.
