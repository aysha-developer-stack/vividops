import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck, Copy, Check, KeyRound, Smartphone } from "lucide-react";
import type { User } from "@workspace/api-client-react";
import {
  confirmTwoFactorEnroll,
  qrImageUrl,
  startTwoFactorEnroll,
  verifyTwoFactor,
  type EnrollStartResult,
  type TwoFactorChallenge,
} from "@/lib/twoFactorApi";

type Props = {
  challenge: TwoFactorChallenge;
  onAuthenticated: (user: User, opts?: { usedBackupCode?: boolean }) => void;
  onBack: () => void;
};

export default function TwoFactorChallengePanel({ challenge, onAuthenticated, onBack }: Props) {
  const [enroll, setEnroll] = useState<EnrollStartResult | null>(null);
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(true);
  const [useBackup, setUseBackup] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [savedCodes, setSavedCodes] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (challenge.twoFactorEnrolled) return;
    let cancelled = false;
    setBusy(true);
    void startTwoFactorEnroll(challenge.challengeToken)
      .then((data) => {
        if (!cancelled) setEnroll(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not start setup");
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [challenge.challengeToken, challenge.twoFactorEnrolled]);

  const copyText = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (!challenge.twoFactorEnrolled) {
        const result = await confirmTwoFactorEnroll({
          challengeToken: challenge.challengeToken,
          code,
          rememberDevice,
        });
        setPendingUser(result.user);
        setBackupCodes(result.backupCodes);
        setCode("");
        return;
      }
      const result = await verifyTwoFactor({
        challengeToken: challenge.challengeToken,
        code,
        rememberDevice,
        useBackupCode: useBackup,
      });
      onAuthenticated(result.user, { usedBackupCode: result.usedBackupCode });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  };

  if (backupCodes && pendingUser) {
    return (
      <div>
        <div className="mb-6">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
            <ShieldCheck size={22} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Save your backup codes</h1>
          <p className="text-sm text-gray-500">
            Store these somewhere safe. Each code works once if you lose your authenticator app.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4 font-mono text-sm text-gray-800">
          {backupCodes.map((item) => (
            <div key={item}>{item}</div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void copyText(backupCodes.join("\n"))}
          className="mb-4 text-sm font-medium text-primary hover:underline inline-flex items-center gap-1.5"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied" : "Copy all codes"}
        </button>
        <label className="flex items-start gap-2 text-sm text-gray-700 mb-5">
          <input
            type="checkbox"
            checked={savedCodes}
            onChange={(e) => setSavedCodes(e.target.checked)}
            className="mt-0.5"
          />
          I saved these backup codes in a safe place
        </label>
        <button
          type="button"
          disabled={!savedCodes}
          onClick={() => onAuthenticated(pendingUser)}
          className="w-full bg-primary text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-50"
        >
          Continue to Vivid OPS
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)}>
      <div className="mb-6">
        <div className="w-12 h-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-4">
          {challenge.twoFactorEnrolled ? <KeyRound size={22} /> : <Smartphone size={22} />}
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {challenge.twoFactorEnrolled ? "Two-factor authentication" : "Set up two-factor authentication"}
        </h1>
        <p className="text-sm text-gray-500">
          {challenge.twoFactorEnrolled
            ? `Enter the code from your authenticator app for ${challenge.maskedEmail}.`
            : "Required for every Vivid OPS account. Scan the QR code with Google Authenticator or Authy."}
        </p>
      </div>

      {!challenge.twoFactorEnrolled && enroll && (
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <img
            src={qrImageUrl(enroll.otpauthUrl)}
            alt="Authenticator QR code"
            className="mx-auto mb-3 h-[180px] w-[180px] rounded-lg bg-white p-2"
          />
          <p className="text-xs text-gray-500 text-center mb-2">Can’t scan? Enter this key manually:</p>
          <div className="flex items-center justify-center gap-2">
            <code className="text-xs font-semibold tracking-wider text-gray-800 break-all">{enroll.secret}</code>
            <button type="button" onClick={() => void copyText(enroll.secret)} className="text-primary">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
          {error}
        </div>
      )}

      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {useBackup ? "Backup code" : "6-digit code"}
      </label>
      <input
        inputMode={useBackup ? "text" : "numeric"}
        autoComplete="one-time-code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={useBackup ? "XXXX-XXXX" : "000000"}
        className="w-full mb-4 rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-center font-mono text-lg tracking-[0.3em] focus:border-primary focus:outline-none"
      />

      <label className="flex items-start gap-2 text-sm text-gray-700 mb-4">
        <input
          type="checkbox"
          checked={rememberDevice}
          onChange={(e) => setRememberDevice(e.target.checked)}
          className="mt-0.5"
        />
        Trust this device for 30 days
      </label>

      {challenge.twoFactorEnrolled && (
        <button
          type="button"
          onClick={() => {
            setUseBackup((v) => !v);
            setCode("");
            setError(null);
          }}
          className="mb-4 text-xs font-medium text-primary hover:underline"
        >
          {useBackup ? "Use authenticator code instead" : "Use a backup code instead"}
        </button>
      )}

      <motion.button
        type="submit"
        disabled={busy || code.trim().length < 6}
        className="w-full bg-primary text-white rounded-xl py-3.5 text-sm font-semibold disabled:opacity-60"
        whileTap={!busy ? { scale: 0.98 } : {}}
      >
        {busy ? "Verifying…" : challenge.twoFactorEnrolled ? "Verify and sign in" : "Confirm and continue"}
      </motion.button>

      <button type="button" onClick={onBack} className="mt-5 mb-10 w-full text-sm text-gray-500 hover:text-gray-800">
        Back to password
      </button>
    </form>
  );
}
