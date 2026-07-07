import { randomUUID } from "node:crypto";

type CachedToken = {
  accessToken: string;
  expiresAtMs: number;
};

let cachedCliqToken: CachedToken | null = null;

export function getZohoAccountsBaseUrl(): string {
  const raw =
    process.env.ZOHO_ACCOUNTS_DOMAIN ||
    process.env.ZOHO_ACCOUNTS_URL ||
    "https://accounts.zoho.com.au";
  return raw.trim().replace(/\/+$/, "");
}

export function getZohoCliqScopes(): string {
  return (
    process.env.ZOHO_CLIQ_SCOPES ||
    "ZohoCliq.Channels.ALL,ZohoCliq.Messages.ALL,ZohoCliq.Webhooks.CREATE,ZohoCliq.Users.READ"
  );
}

export function getZohoRedirectUri(): string {
  const raw = process.env.ZOHO_REDIRECT_URI || "http://localhost:3001/api/zoho/callback";
  return raw.trim();
}

export function getZohoClientId(): string {
  return (process.env.ZOHO_CLIENT_ID || "").trim();
}

export function getZohoClientSecret(): string {
  return (process.env.ZOHO_CLIENT_SECRET || "").trim();
}

export function getZohoCliqRefreshToken(): string {
  return (process.env.ZOHO_CLIQ_REFRESH_TOKEN || "").trim();
}

export function createZohoState(): string {
  return randomUUID();
}

export function buildZohoAuthorizationUrl(state: string): string {
  const base = `${getZohoAccountsBaseUrl()}/oauth/v2/auth`;
  const params = new URLSearchParams({
    scope: getZohoCliqScopes(),
    client_id: getZohoClientId(),
    response_type: "code",
    redirect_uri: getZohoRedirectUri(),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${base}?${params.toString()}`;
}

export async function exchangeZohoCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string | null;
  expiresInSec: number;
}> {
  const clientId = getZohoClientId();
  const clientSecret = getZohoClientSecret();
  const redirectUri = getZohoRedirectUri();
  if (!clientId || !clientSecret) {
    throw new Error("ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET not configured");
  }

  const url = `${getZohoAccountsBaseUrl()}/oauth/v2/token`;
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : "oauth_error";
    throw new Error(`Zoho token exchange failed: ${msg}`);
  }

  const accessToken = typeof json?.access_token === "string" ? json.access_token : "";
  const refreshToken =
    typeof json?.refresh_token === "string" ? json.refresh_token : null;
  const expiresInSec = typeof json?.expires_in === "number" ? json.expires_in : 3600;
  if (!accessToken) throw new Error("Zoho token exchange returned no access_token");

  cachedCliqToken = {
    accessToken,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
  };

  return { accessToken, refreshToken, expiresInSec };
}

export async function refreshZohoCliqAccessToken(): Promise<string> {
  const clientId = getZohoClientId();
  const clientSecret = getZohoClientSecret();
  const refreshToken = getZohoCliqRefreshToken();
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("ZOHO_CLIENT_ID / ZOHO_CLIENT_SECRET / ZOHO_CLIQ_REFRESH_TOKEN not configured");
  }

  const url = `${getZohoAccountsBaseUrl()}/oauth/v2/token`;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => null)) as any;
  if (!res.ok) {
    const msg = typeof json?.error === "string" ? json.error : "oauth_error";
    throw new Error(`Zoho refresh failed: ${msg}`);
  }

  const accessToken = typeof json?.access_token === "string" ? json.access_token : "";
  const expiresInSec = typeof json?.expires_in === "number" ? json.expires_in : 3600;
  if (!accessToken) throw new Error("Zoho refresh returned no access_token");

  cachedCliqToken = {
    accessToken,
    expiresAtMs: Date.now() + Math.max(60, expiresInSec - 60) * 1000,
  };
  return accessToken;
}

export async function getZohoCliqAccessToken(): Promise<string> {
  const legacy = (process.env.ZOHO_CLIQ_OAUTH_TOKEN || "").trim();
  if (legacy) return legacy;

  if (cachedCliqToken && cachedCliqToken.expiresAtMs > Date.now()) {
    return cachedCliqToken.accessToken;
  }
  return refreshZohoCliqAccessToken();
}

