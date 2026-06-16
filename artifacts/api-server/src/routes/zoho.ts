import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  buildZohoAuthorizationUrl,
  createZohoState,
  exchangeZohoCodeForTokens,
  getZohoClientId,
  getZohoClientSecret,
  getZohoRedirectUri,
} from "../lib/zoho";

const router: IRouter = Router();

const STATE_COOKIE = "zoho_oauth_state";
const STATE_TTL_MS = 10 * 60 * 1000;

function cookieOpts() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_MS,
  };
}

router.get("/zoho/oauth/start", requireAuth, async (req, res) => {
  try {
    const clientId = getZohoClientId();
    const clientSecret = getZohoClientSecret();
    const redirectUri = getZohoRedirectUri();
    const missing = [
      ...(clientId ? [] : ["ZOHO_CLIENT_ID"]),
      ...(clientSecret ? [] : ["ZOHO_CLIENT_SECRET"]),
      ...(redirectUri ? [] : ["ZOHO_REDIRECT_URI"]),
    ];
    if (missing.length > 0) {
      return res.status(501).json({
        error: "Zoho OAuth not configured",
        missing,
      });
    }

    const state = createZohoState();
    res.cookie(STATE_COOKIE, state, cookieOpts());

    const url = buildZohoAuthorizationUrl(state);
    return res.redirect(url);
  } catch (err) {
    logger.error({ err }, "Failed to start Zoho OAuth");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/zoho/callback", requireAuth, async (req, res) => {
  try {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code) return res.status(400).send("Missing code");
    const cookieState = typeof req.cookies?.[STATE_COOKIE] === "string" ? req.cookies[STATE_COOKIE] : "";
    if (!cookieState || cookieState !== state) return res.status(400).send("Invalid state");
    res.clearCookie(STATE_COOKIE, { ...cookieOpts(), maxAge: 0 });

    const tokens = await exchangeZohoCodeForTokens(code);

    if (tokens.refreshToken) {
      process.env.ZOHO_CLIQ_REFRESH_TOKEN = tokens.refreshToken;
    }

    return res.json({
      success: true,
      message:
        "Zoho OAuth complete. Copy ZOHO_CLIQ_REFRESH_TOKEN into your server .env and restart the API server.",
      refreshToken: tokens.refreshToken,
      expiresInSec: tokens.expiresInSec,
    });
  } catch (err) {
    logger.error({ err }, "Zoho OAuth callback failed");
    return res.status(500).json({ error: "Zoho OAuth failed" });
  }
});

export default router;
