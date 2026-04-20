import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight, ArrowLeft, Mail, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImg from "@assets/www.vividengineering.com.au__1776407417497.png";
import { setSession } from "@/lib/auth";

const floatingOrbs = [
  { size: 320, x: "-20%", y: "-10%", delay: 0, color: "bg-primary/20" },
  { size: 200, x: "60%", y: "60%", delay: 1.5, color: "bg-sky-400/15" },
  { size: 140, x: "80%", y: "10%", delay: 0.8, color: "bg-primary/10" },
];

const stats = [
  { value: "10,000+", label: "Active users" },
  { value: "99.9%", label: "Uptime SLA" },
  { value: "4.9★", label: "User rating" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [, setLocation] = useLocation();

  const validate = () => {
    const newErrors: { email?: string; password?: string } = {};
    if (!email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = "Enter a valid email address";
    if (!password) newErrors.password = "Password is required";
    else if (password.length < 6) newErrors.password = "Password must be at least 6 characters";
    return newErrors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    setIsLoading(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsLoading(false);
    setIsSuccess(true);
    setSession(email, "Alex Morgan");
    setTimeout(() => setLocation("/super-admin"), 1600);
  };

  return (
    <div className="min-h-screen flex overflow-hidden bg-white">
      {/* ── LEFT PANEL ── */}
      <motion.div
        initial={{ x: -60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="hidden lg:flex flex-col justify-between w-[52%] bg-black relative overflow-hidden px-14 py-12"
      >
        {/* Floating orbs */}
        {floatingOrbs.map((orb, i) => (
          <motion.div
            key={i}
            className={`absolute rounded-full blur-3xl pointer-events-none ${orb.color}`}
            style={{ width: orb.size, height: orb.size, left: orb.x, top: orb.y }}
            animate={{ scale: [1, 1.15, 1], opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 5 + i, repeat: Infinity, delay: orb.delay, ease: "easeInOut" }}
          />
        ))}

        {/* Grid dot overlay */}
        <div
          className="absolute inset-0 pointer-events-none opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle, #0B7EB9 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />

        {/* Top gradient line */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* Logo */}
        <div className="relative z-10">
          <Link href="/">
            <motion.img
              src={logoImg}
              alt="Vivid Engineering"
              className="h-10 w-auto object-contain cursor-pointer"
              whileHover={{ scale: 1.04 }}
              transition={{ type: "spring", stiffness: 400 }}
            />
          </Link>
        </div>

        {/* Center content */}
        <motion.div
          className="relative z-10"
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          {/* Animated dashboard preview card */}
          <motion.div
            className="bg-white/5 border border-white/10 rounded-2xl p-5 mb-8 backdrop-blur-sm"
            whileHover={{ y: -4, borderColor: "rgba(11,126,185,0.4)" }}
            transition={{ type: "spring", stiffness: 300 }}
          >
            <div className="flex items-center gap-2 mb-4">
              <div className="w-3 h-3 rounded-full bg-red-400/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-400/80" />
              <div className="w-3 h-3 rounded-full bg-green-400/80" />
              <div className="ml-auto text-xs text-gray-500 font-mono">app.jobflow.io</div>
            </div>
            {[
              { label: "Electrical Inspection #481", status: "In Progress", pct: 72, color: "bg-primary" },
              { label: "Plumbing Overhaul - Site B", status: "Pending", pct: 28, color: "bg-yellow-400" },
              { label: "Annual Safety Audit", status: "Completed", pct: 100, color: "bg-green-400" },
            ].map((job, i) => (
              <motion.div
                key={job.label}
                className="mb-3 last:mb-0"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.12 }}
              >
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs text-gray-300 font-medium truncate">{job.label}</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ml-2 shrink-0 ${
                    job.status === "In Progress" ? "bg-primary/20 text-primary" :
                    job.status === "Pending" ? "bg-yellow-400/20 text-yellow-300" :
                    "bg-green-400/20 text-green-400"
                  }`}>{job.status}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${job.color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${job.pct}%` }}
                    transition={{ delay: 0.9 + i * 0.15, duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </motion.div>
            ))}
          </motion.div>

          <h2 className="text-3xl font-bold text-white leading-snug mb-3">
            Everything your ops team needs,{" "}
            <span className="text-primary">in one place.</span>
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Assign jobs, track progress, manage files and generate reports — all from a single dashboard built for engineering teams.
          </p>
        </motion.div>

        {/* Stats row */}
        <motion.div
          className="relative z-10 flex gap-8 pt-6 border-t border-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.8 + i * 0.1 }}
            >
              <div className="text-xl font-bold text-white">{s.value}</div>
              <div className="text-xs text-gray-500">{s.label}</div>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>

      {/* ── RIGHT PANEL ── */}
      <motion.div
        initial={{ x: 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="flex-1 flex flex-col justify-center items-center px-8 md:px-16 py-12 bg-white relative"
      >
        {/* Subtle top accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-sky-400 to-primary bg-[length:200%_100%] animate-[shimmer_3s_linear_infinite]" />

        {/* Back link */}
        <motion.div
          className="absolute top-6 left-6 lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Link href="/">
            <motion.span
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-primary transition-colors cursor-pointer"
              whileHover={{ x: -3 }}
            >
              <ArrowLeft size={14} /> Back
            </motion.span>
          </Link>
        </motion.div>

        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <motion.div
            className="flex justify-center mb-8 lg:hidden"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Link href="/">
              <img src={logoImg} alt="Vivid Engineering" className="h-9 w-auto object-contain" />
            </Link>
          </motion.div>

          <AnimatePresence mode="wait">
            {isSuccess ? (
              /* Success state */
              <motion.div
                key="success"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="text-center"
              >
                <motion.div
                  className="w-20 h-20 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-6"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, delay: 0.1 }}
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, delay: 0.3 }}
                  >
                    <CheckCircle2 size={40} className="text-green-500" />
                  </motion.div>
                </motion.div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome back!</h2>
                <p className="text-gray-500 text-sm">Redirecting you to your dashboard…</p>
                <motion.div
                  className="mt-6 h-1 bg-gray-100 rounded-full overflow-hidden"
                >
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: "100%" }}
                    transition={{ duration: 2, ease: "linear" }}
                  />
                </motion.div>
              </motion.div>
            ) : (
              /* Form state */
              <motion.div
                key="form"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.4 }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="mb-8"
                >
                  <h1 className="text-3xl font-bold text-gray-900 mb-2">Sign in</h1>
                  <p className="text-gray-500 text-sm">
                    Don't have an account?{" "}
                    <motion.a
                      href="#"
                      className="text-primary font-medium hover:underline"
                      whileHover={{ color: "#0369a1" }}
                    >
                      Get started free
                    </motion.a>
                  </p>
                </motion.div>

                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  {/* Email field */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.25 }}
                  >
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Email address
                    </label>
                    <motion.div
                      className={`relative flex items-center rounded-xl border-2 transition-colors duration-200 ${
                        errors.email
                          ? "border-red-400 bg-red-50"
                          : focusedField === "email"
                          ? "border-primary bg-white shadow-md shadow-primary/10"
                          : "border-gray-200 bg-gray-50 hover:border-gray-300"
                      }`}
                      animate={errors.email ? { x: [-6, 6, -4, 4, 0] } : {}}
                      transition={{ duration: 0.4 }}
                    >
                      <Mail
                        size={16}
                        className={`ml-4 shrink-0 transition-colors ${
                          focusedField === "email" ? "text-primary" : "text-gray-400"
                        }`}
                      />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: undefined })); }}
                        onFocus={() => setFocusedField("email")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="you@company.com"
                        className="flex-1 bg-transparent py-3.5 pl-3 pr-4 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                      />
                    </motion.div>
                    <AnimatePresence>
                      {errors.email && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="text-xs text-red-500 mt-1.5 ml-1"
                        >
                          {errors.email}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* Password field */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.32 }}
                  >
                    <div className="flex justify-between items-center mb-1.5">
                      <label className="block text-sm font-medium text-gray-700">Password</label>
                      <motion.a
                        href="#"
                        className="text-xs text-primary hover:underline font-medium"
                        whileHover={{ color: "#0369a1" }}
                      >
                        Forgot password?
                      </motion.a>
                    </div>
                    <motion.div
                      className={`relative flex items-center rounded-xl border-2 transition-colors duration-200 ${
                        errors.password
                          ? "border-red-400 bg-red-50"
                          : focusedField === "password"
                          ? "border-primary bg-white shadow-md shadow-primary/10"
                          : "border-gray-200 bg-gray-50 hover:border-gray-300"
                      }`}
                      animate={errors.password ? { x: [-6, 6, -4, 4, 0] } : {}}
                      transition={{ duration: 0.4 }}
                    >
                      <Lock
                        size={16}
                        className={`ml-4 shrink-0 transition-colors ${
                          focusedField === "password" ? "text-primary" : "text-gray-400"
                        }`}
                      />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: undefined })); }}
                        onFocus={() => setFocusedField("password")}
                        onBlur={() => setFocusedField(null)}
                        placeholder="••••••••"
                        className="flex-1 bg-transparent py-3.5 pl-3 pr-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                      />
                      <motion.button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-2 mr-2 text-gray-400 hover:text-gray-600 transition-colors rounded-lg hover:bg-gray-100"
                        whileTap={{ scale: 0.88 }}
                        whileHover={{ scale: 1.1 }}
                      >
                        <AnimatePresence mode="wait">
                          <motion.span
                            key={showPassword ? "hide" : "show"}
                            initial={{ opacity: 0, rotate: -15 }}
                            animate={{ opacity: 1, rotate: 0 }}
                            exit={{ opacity: 0, rotate: 15 }}
                            transition={{ duration: 0.15 }}
                          >
                            {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                          </motion.span>
                        </AnimatePresence>
                      </motion.button>
                    </motion.div>
                    <AnimatePresence>
                      {errors.password && (
                        <motion.p
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -4 }}
                          className="text-xs text-red-500 mt-1.5 ml-1"
                        >
                          {errors.password}
                        </motion.p>
                      )}
                    </AnimatePresence>
                  </motion.div>

                  {/* Remember me */}
                  <motion.label
                    className="flex items-center gap-2.5 cursor-pointer group"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.38 }}
                    whileHover={{ x: 2 }}
                  >
                    <div className="relative">
                      <input type="checkbox" className="peer sr-only" />
                      <div className="w-4 h-4 border-2 border-gray-300 rounded peer-checked:border-primary peer-checked:bg-primary transition-colors group-hover:border-primary/60" />
                    </div>
                    <span className="text-sm text-gray-500 group-hover:text-gray-700 transition-colors">Keep me signed in</span>
                  </motion.label>

                  {/* Submit button */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.44 }}
                  >
                    <motion.button
                      type="submit"
                      disabled={isLoading}
                      className="w-full relative bg-primary text-white rounded-xl py-3.5 text-sm font-semibold shadow-lg shadow-primary/25 overflow-hidden flex items-center justify-center gap-2 disabled:opacity-80"
                      whileHover={!isLoading ? { scale: 1.02, y: -1, boxShadow: "0 12px 32px rgba(11,126,185,0.35)" } : {}}
                      whileTap={!isLoading ? { scale: 0.98 } : {}}
                    >
                      {/* Shimmer sweep on hover */}
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                        initial={{ x: "-100%" }}
                        whileHover={{ x: "100%" }}
                        transition={{ duration: 0.5 }}
                      />

                      <AnimatePresence mode="wait">
                        {isLoading ? (
                          <motion.div
                            key="loading"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="flex items-center gap-2"
                          >
                            <motion.div
                              className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                              animate={{ rotate: 360 }}
                              transition={{ duration: 0.7, repeat: Infinity, ease: "linear" }}
                            />
                            Signing in…
                          </motion.div>
                        ) : (
                          <motion.span
                            key="idle"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="relative z-10 flex items-center gap-2"
                          >
                            Sign In
                            <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                              <ArrowRight size={16} />
                            </motion.span>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  </motion.div>
                </form>

                {/* Divider */}
                <motion.div
                  className="flex items-center gap-3 my-6"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">or continue with</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </motion.div>

                {/* SSO Button */}
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.55 }}
                >
                  <motion.button
                    type="button"
                    className="w-full flex items-center justify-center gap-3 border-2 border-gray-200 rounded-xl py-3 text-sm font-medium text-gray-700 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors"
                    whileHover={{ scale: 1.01, y: -1, borderColor: "#d1d5db" }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
                      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
                    </svg>
                    Sign in with Google
                  </motion.button>
                </motion.div>

                {/* Footer note */}
                <motion.p
                  className="text-center text-xs text-gray-400 mt-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.65 }}
                >
                  By signing in you agree to our{" "}
                  <a href="#" className="text-primary hover:underline">Terms</a> and{" "}
                  <a href="#" className="text-primary hover:underline">Privacy Policy</a>.
                </motion.p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom back-to-home — desktop */}
        <motion.div
          className="absolute bottom-8 left-0 right-0 flex justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
        >
          <Link href="/">
            <motion.span
              className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-primary transition-colors cursor-pointer"
              whileHover={{ x: -3 }}
            >
              <ArrowLeft size={14} />
              Back to JobFlow
            </motion.span>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
