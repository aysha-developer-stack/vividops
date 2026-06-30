import { useState } from "react";
import { useLocation, Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import logoImg from "@assets/vv_1778503190047.png";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send reset link");
      }

      setIsSuccess(true);
      toast({
        title: "Link Sent",
        description: "If an account exists, a reset link has been sent to your email.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* ── LEFT PANEL ── */}
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
          <Link href="/">
            <img src={logoImg} alt="Vivid OPS" className="h-20 w-auto object-contain cursor-pointer" />
          </Link>
        </div>

        <div className="relative z-10">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl font-extrabold text-white leading-tight mb-6"
          >
            Recover your <span className="text-primary">access.</span>
          </motion.h1>
          <p className="text-gray-400 text-lg max-w-md">
            Enter your email address and we'll send you a secure link to reset your password.
          </p>
        </div>

        <div className="relative z-10 text-xs text-gray-500 uppercase tracking-widest">
          Vivid Engineering · Operations Platform
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex flex-col justify-center items-center px-8 md:px-16 py-12 bg-gray-50 relative">
        <div className="absolute top-6 left-6">
          <Link href="/login">
            <motion.div
              whileHover={{ x: -4 }}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-primary transition-colors cursor-pointer font-medium"
            >
              <ArrowLeft size={16} /> Back to login
            </motion.div>
          </Link>
        </div>

        <div className="w-full max-w-sm">
          <AnimatePresence mode="wait">
            {isSuccess ? (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center"
              >
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle2 size={40} className="text-emerald-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your email</h2>
                <p className="text-gray-500 mb-8 leading-relaxed">
                  We've sent a password reset link to <span className="font-semibold text-gray-900">{email}</span>. 
                  The link will expire in 1 hour.
                </p>
                <Link href="/login">
                  <Button className="w-full bg-black hover:bg-gray-900 text-white rounded-xl h-12 font-bold">
                    Return to Login
                  </Button>
                </Link>
              </motion.div>
            ) : (
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div className="mb-10">
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">Forgot Password?</h1>
                  <p className="text-gray-500 text-sm">
                    No worries! Just enter your email and we'll help you get back in.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-gray-700 ml-1">Email Address</label>
                    <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400 group-focus-within:text-primary transition-colors">
                        <Mail size={18} />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="block w-full pl-12 pr-4 py-3.5 bg-white border-2 border-gray-100 rounded-2xl text-sm focus:outline-none focus:border-primary transition-all shadow-sm"
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={isLoading || !email}
                    className="w-full bg-primary hover:bg-primary/90 text-white rounded-2xl h-14 font-bold shadow-lg shadow-primary/20 flex items-center justify-center gap-2 transition-all disabled:opacity-70"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        Sending Link...
                      </>
                    ) : (
                      <>
                        Send Reset Link
                        <ArrowRight size={20} />
                      </>
                    )}
                  </Button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
