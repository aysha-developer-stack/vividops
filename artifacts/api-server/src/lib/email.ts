import { Resend } from "resend";
import { logger } from "./logger";

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.RESEND_FROM_EMAIL ?? "Vivid OPS <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

if (!resend) {
  logger.warn(
    "RESEND_API_KEY is not set — invite emails will be logged only, not sent.",
  );
}

export interface InviteEmailParams {
  to: string;
  name: string;
  tempPassword: string;
  signInUrl: string;
}

export async function sendInviteEmail(
  params: InviteEmailParams,
): Promise<{ sent: boolean }> {
  const { to, name, tempPassword, signInUrl } = params;

  if (!resend) {
    logger.info(
      { to, signInUrl },
      "[email:dry-run] Would send invite email (RESEND_API_KEY missing)",
    );
    return { sent: false };
  }

  const subject = "Welcome to Vivid OPS — your account is ready";
  const html = `
    <div style="font-family: system-ui, sans-serif; color:#0f172a; max-width:520px; margin:0 auto; padding:24px;">
      <h1 style="color:#0B7EB9; font-size:22px; margin:0 0 8px;">Welcome to Vivid OPS, ${escapeHtml(name)}.</h1>
      <p style="color:#475569; line-height:1.55;">
        An account has been created for you on the Vivid Engineering operations console.
        Use the temporary password below to sign in. You'll be asked to set a permanent
        password on your first visit.
      </p>
      <div style="margin:20px 0; padding:16px 20px; background:#f1f5f9; border-radius:12px;">
        <div style="font-size:12px; color:#64748b; letter-spacing:0.04em; text-transform:uppercase;">Temporary password</div>
        <div style="font-family: ui-monospace, SFMono-Regular, monospace; font-size:18px; font-weight:600; color:#0f172a; margin-top:6px;">
          ${escapeHtml(tempPassword)}
        </div>
      </div>
      <a href="${escapeAttr(signInUrl)}" style="display:inline-block; background:#0B7EB9; color:#fff; padding:12px 22px; border-radius:10px; text-decoration:none; font-weight:600;">Sign in to Vivid OPS</a>
      <p style="color:#94a3b8; font-size:12px; margin-top:28px;">
        If you weren't expecting this email, you can safely ignore it.
      </p>
    </div>
  `;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to,
      subject,
      html,
    });
    if (error) {
      logger.error({ err: error, to }, "Failed to send invite email");
      return { sent: false };
    }
    return { sent: true };
  } catch (err) {
    logger.error({ err, to }, "Failed to send invite email");
    return { sent: false };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function escapeAttr(s: string): string {
  return escapeHtml(s);
}
