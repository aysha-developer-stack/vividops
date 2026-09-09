import type { User } from "@workspace/api-client-react";

export type TwoFactorChallenge = {
  requiresTwoFactor: true;
  challengeToken: string;
  twoFactorEnrolled: boolean;
  maskedEmail: string;
};

export type LoginApiResult =
  | { kind: "authenticated"; user: User }
  | { kind: "challenge"; challenge: TwoFactorChallenge };

export type EnrollStartResult = {
  secret: string;
  otpauthUrl: string;
  maskedEmail: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function loginWithPassword(opts: {
  email: string;
  password: string;
  role: string;
}): Promise<LoginApiResult> {
  const res = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  const data = await parseJson<{ user?: User } & Partial<TwoFactorChallenge>>(res);
  if (data.requiresTwoFactor && data.challengeToken) {
    return {
      kind: "challenge",
      challenge: {
        requiresTwoFactor: true,
        challengeToken: data.challengeToken,
        twoFactorEnrolled: !!data.twoFactorEnrolled,
        maskedEmail: data.maskedEmail || "",
      },
    };
  }
  if (!data.user) throw new Error("Unexpected login response");
  return { kind: "authenticated", user: data.user };
}

export async function startTwoFactorEnroll(challengeToken: string): Promise<EnrollStartResult> {
  const res = await fetch("/api/auth/2fa/enroll-start", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challengeToken }),
  });
  return parseJson<EnrollStartResult>(res);
}

export async function confirmTwoFactorEnroll(opts: {
  challengeToken: string;
  code: string;
  rememberDevice: boolean;
}): Promise<{ user: User; backupCodes: string[] }> {
  const res = await fetch("/api/auth/2fa/enroll-confirm", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return parseJson<{ user: User; backupCodes: string[] }>(res);
}

export async function verifyTwoFactor(opts: {
  challengeToken: string;
  code: string;
  rememberDevice: boolean;
  useBackupCode?: boolean;
}): Promise<{ user: User; usedBackupCode?: boolean }> {
  const res = await fetch("/api/auth/2fa/verify", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts),
  });
  return parseJson<{ user: User; usedBackupCode?: boolean }>(res);
}

export async function fetchTwoFactorStatus(): Promise<{ enrolled: boolean; backupCodesRemaining: number }> {
  const res = await fetch("/api/auth/2fa/status", { credentials: "include" });
  return parseJson<{ enrolled: boolean; backupCodesRemaining: number }>(res);
}

export async function regenerateBackupCodes(code: string): Promise<{ backupCodes: string[] }> {
  const res = await fetch("/api/auth/2fa/backup-codes", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  return parseJson<{ backupCodes: string[] }>(res);
}

export async function resetUserTwoFactor(userId: string): Promise<void> {
  const res = await fetch(`/api/users/${userId}/reset-2fa`, {
    method: "POST",
    credentials: "include",
  });
  await parseJson<{ ok: boolean }>(res);
}

export function qrImageUrl(otpauthUrl: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&ecc=M&data=${encodeURIComponent(otpauthUrl)}`;
}
