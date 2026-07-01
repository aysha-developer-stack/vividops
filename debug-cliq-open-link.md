# [OPEN] Debug Session: cliq-open-link

## Summary
- Symptom: Clicking `Open in Cliq` still opens `https://cliq.zoho.com.au/company/vivid-ops/channels/jobgood` and Zoho shows "Sorry, We could not process your request!".
- Expected: The app should open the canonical Zoho channel URL for the real job channel, or at minimum a valid accessible URL.

## Scope
- Frontend entry points:
  - `artifacts/jms-landing/src/pages/admin/Communication.tsx`
  - `artifacts/jms-landing/src/pages/admin/JobDetail.tsx`
- Backend channel resolution:
  - `artifacts/api-server/src/routes/jobs.ts`

## Hypotheses
1. The live server is not running the latest backend/frontend code, so the browser still receives the old stale URL.
2. The live `/api/jobs/:id/cliq/channel` or `/api/jobs/:id/cliq/join` response still returns `jobgood` / `vivid-ops`, so the bug is server-side data resolution.
3. The backend is querying Zoho successfully but the Zoho API response for that channel lacks a canonical permalink, causing fallback to a guessed invalid URL.
4. The Zoho channel exists, but the authenticated Cliq user is not actually a member, so the URL is valid but inaccessible.
5. A cached frontend state or deployed bundle still opens the pre-fix URL even when the backend response is already corrected.

## Evidence Plan
- Capture the actual JSON returned by `/api/jobs/:id/cliq/channel` and `/api/jobs/:id/cliq/join`.
- Confirm which server commit/build is currently serving requests.
- Inspect whether Zoho resolution returns channel id, unique name, and permalink for the legacy channel.
- Compare pre-click and post-join URL values.

## Status
- Waiting for runtime instrumentation and reproduction.

## Evidence
- Local debug server started successfully and wrote `.dbg/cliq-open-link.env`.
- Instrumented API server restarted successfully on `0.0.0.0:3001`.
- After one user reproduction, `.dbg/trae-debug-log-cliq-open-link.ndjson` was not created.

## Hypothesis Review
| ID | Hypothesis | Status | Evidence Summary |
|----|------------|--------|------------------|
| A | The live server is not running the latest backend/frontend code. | REJECTED | User confirmed the click targets deployed `https://vividops.com.au`, not the local instrumented API. |
| B | `/cliq/channel` or `/cliq/join` still returns `jobgood` / `vivid-ops`. | INCONCLUSIVE | We have the deployed `/cliq/join` request URL, but not yet its response body or the `/cliq/channel` payload. |
| C | Zoho lacks canonical permalink and forces fallback URL. | INCONCLUSIVE | No Zoho resolution event captured yet. |
| D | The Cliq user is not a member of that channel. | LIKELY | Deployed `POST /api/jobs/.../cliq/join` returned `502 Bad Gateway`, consistent with the backend failing to add the current user as a channel member. |
| E | Cached frontend or different deployment is still being used. | CONFIRMED | User provided deployed request URL `https://vividops.com.au/api/jobs/.../cliq/join`; local instrumentation could not observe it because reproduction was not against localhost. |

## New Evidence
- Deployed request captured by user:
  - `POST https://vividops.com.au/api/jobs/60cba6e6-fabb-4138-b9ea-e9f71329e02c/cliq/join`
  - Status: `502 Bad Gateway`
- This proves the click path reaches the deployed backend and the join attempt fails server-side before Cliq access is granted.

## Additional Evidence
- Public health endpoint responds successfully at `https://vividops.com.au/api/health`.
- Railway CLI is not authenticated on this machine (`railway whoami` => unauthorized), so production restart/redeploy cannot be triggered directly from this workspace.
- Latest successful user-observed join response after fixes:
  - `{"success":true,"channelUrl":"https://cliq.zoho.com.au/app/chats/CT_1193239807648465788_7003567933","channelName":"jobgood"}`
- Directly opening that returned `app/chats/...` URL still failed in browser, so the browser-safe deep link should fall back to the channel permalink format.
