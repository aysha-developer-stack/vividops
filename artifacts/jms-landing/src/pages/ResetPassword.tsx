import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Lock,
  Key,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Eye,
  EyeOff,
  ShieldCheck,
} from "lucide-react";
import { useAuth, useResetPassword } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { ROLES, type Role } from "@/lib/roles";
import logoImg from "@assets/vv_1778503190047.png";

export default function ResetPassword() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { user, isLoading } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const resetMutation = useResetPassword();
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      setLocation("/login");
      return;
    }
    if (user.role !== "user" || !user.mustResetPassword) {
      const role = (user.role as Role | undefined) ?? "user";
      setLocation(ROLES[role]?.base ?? "/");
    }
  }, [isLoading, user, setLocation]);

  const passwordStrength = useMemo(() => {
    const value = password;
    const lengthScore =
      value.length >= 14 ? 4 : value.length >= 12 ? 3 : value.length >= 10 ? 2 : value.length >= 8 ? 1 : 0;
    const hasLower = /[a-z]/.test(value);
    const hasUpper = /[A-Z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSymbol = /[^a-zA-Z0-9]/.test(value);
    const variety = [hasLower, hasUpper, hasNumber, hasSymbol].filter(Boolean).length;

    const score = Math.min(4, lengthScore + (variety >= 3 ? 2 : variety >= 2 ? 1 : 0));
    const label =
      score >= 4 ? "Strong" : score === 3 ? "Good" : score === 2 ? "Fair" : score === 1 ? "Weak" : "Too short";
    const bar =
      score >= 4 ? "bg-emerald-500" : score === 3 ? "bg-primary" : score === 2 ? "bg-amber-500" : score === 1 ? "bg-red-500" : "bg-gray-200";
    const width =
      score >= 4 ? "w-full" : score === 3 ? "w-3/4" : score === 2 ? "w-1/2" : score === 1 ? "w-1/4" : "w-0";

    return { score, label, bar, width };
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: "Error", description: "Passwords do not match", variant: "destructive" });
      return;
    }
    if (password.length < 8) {
      toast({ title: "Error", description: "Password must be at least 8 characters", variant: "destructive" });
      return;
    }

    try {
      const updated = await resetMutation.mutateAsync({ 
        data: { 
          currentPassword, 
          newPassword: password 
        } 
      });
      setSuccess(true);
      toast({
        title: "Password Reset Successful",
        description: "Your password has been updated. Redirecting to dashboard...",
      });
      const targetRole = (updated.role as Role | undefined) ?? "user";
      const target = ROLES[targetRole]?.base ?? "/";
      setTimeout(() => setLocation(target), 2000);
    } catch (err) {
      // Error is handled by mutation or toast
    }
  };

  const isSubmitting = resetMutation.isPending;
  const error = resetMutation.error instanceof Error ? resetMutation.error.message : null;

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="text-emerald-600" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Password Updated!</h2>
          <p className="text-gray-500 mb-8">Your account is now secure. We're redirecting you to your dashboard.</p>
          <div className="w-full bg-gray-100 h-1 rounded-full overflow-hidden">
            <motion.div 
              className="bg-primary h-full"
              initial={{ width: 0 }}
              animate={{ width: "100%" }}
              transition={{ duration: 2 }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex bg-white">
      <div className="hidden lg:flex flex-col justify-between w-[52%] bg-black relative overflow-hidden px-14 py-12">
        <div
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle, #0B7EB9 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

        <div className="relative z-10">
          <motion.img
            src={logoImg}
            alt="Vivid OPS"
            className="h-20 w-auto object-contain"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          />
        </div>

        <div className="relative z-10 max-w-xl">
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05 }}
            className="text-4xl font-extrabold text-white leading-tight"
          >
            Secure your account
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.12 }}
            className="mt-4 text-white/70 text-sm leading-relaxed"
          >
            This is your first sign-in. Set a new password to continue. Choose something strong and unique.
          </motion.p>
          {user?.email && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.18 }}
              className="mt-6 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/10 border border-white/10 text-white/90 text-sm"
            >
              <ShieldCheck size={16} className="text-primary" />
              <span className="font-medium">{user.email}</span>
            </motion.div>
          )}
        </div>

        <div className="relative z-10 text-xs text-white/50">
          © {new Date().getFullYear()} Vivid OPS
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-10 bg-gray-50">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-white rounded-3xl shadow-xl p-8"
        >
          <div className="flex items-start gap-3 mb-6">
            <div className="w-11 h-11 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Lock size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">Reset Password</h2>
              <p className="text-gray-500 text-sm mt-1">
                Choose a new secure password for your account.
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="leading-relaxed">{error}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700 ml-1">Temporary / Current Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                  <Key size={18} />
                </div>
                <input
                  type={showCurrent ? "text" : "password"}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="block w-full pl-10 pr-12 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-all"
                  placeholder="Enter the temporary password"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrent((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700 ml-1">New Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                  <Lock size={18} />
                </div>
                <input
                  type={showNew ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-12 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-all"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowNew((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <div className="mt-2">
                <div className="flex items-center justify-between text-[11px] text-gray-500">
                  <span>Password strength</span>
                  <span className="font-semibold text-gray-700">{passwordStrength.label}</span>
                </div>
                <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${passwordStrength.bar} ${passwordStrength.width} transition-all`} />
                </div>
                <div className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                  Use at least 8 characters. For best security, include upper/lowercase letters, numbers, and a symbol.
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-gray-700 ml-1">Confirm Password</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                  <Key size={18} />
                </div>
                <input
                  type={showConfirm ? "text" : "password"}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="block w-full pl-10 pr-12 py-3 bg-gray-50 border-2 border-gray-100 rounded-2xl text-sm focus:outline-none focus:border-primary focus:bg-white transition-all"
                  placeholder="••••••••"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                >
                  {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-black hover:bg-gray-900 text-white font-bold py-3.5 rounded-2xl shadow-lg shadow-black/10 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
            >
              {isSubmitting ? "Updating..." : "Update Password"}
              {!isSubmitting && <ArrowRight size={18} />}
            </motion.button>
          </form>
        </motion.div>
      </div>
    </div>
  );
}
