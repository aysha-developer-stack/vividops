import { useState } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, ArrowRight, ArrowLeft, Mail, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImg from "@assets/Untitled-2_1778148933357.png";
import { useLogin } from "@/lib/auth";
import { ROLES, Role } from "@/lib/roles";
import { ApiError } from "@workspace/api-client-react";

const floatingOrbs = [
  { size: 320, x: "-20%", y: "-10%", delay: 0, color: "bg-primary/20" },
  { size: 200, x: "60%", y: "60%", delay: 1.5, color: "bg-sky-400/15" },
  { size: 140, x: "80%", y: "10%", delay: 0.8, color: "bg-primary/10" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; form?: string }>({});
  const [role, setRole] = useState<Role>("super-admin");
  const [, setLocation] = useLocation();
  const loginMutation = useLogin();
  const isLoading = loginMutation.isPending;

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
    try {
      const result = await loginMutation.mutateAsync({ data: { email, password } });
      setIsSuccess(true);
      const targetRole = (result.user.role as Role) ?? role;
      const target = result.user.mustResetPassword
        ? "/reset-password"
        : ROLES[targetRole]?.base ?? "/";
      setTimeout(() => setLocation(target), 1200);
    } catch (err) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Invalid email or password"
          : "Something went wrong. Please try again.";
      setErrors({ form: message });
    }
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
              alt="Vivid OPS"
              className="h-24 w-auto object-contain cursor-pointer"
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
              <div className="ml-auto text-xs text-gray-500 font-mono">app.vividops.com.au</div>
            </div>
            {[
              { label: "Beam & Column Design #481", status: "In Progress", pct: 72, color: "bg-primary" },
              { label: "Underpinning Design - Site B", status: "Pending", pct: 28, color: "bg-yellow-400" },
              { label: "Annual Engineer Certification", status: "Completed", pct: 100, color: "bg-green-400" },
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
            One platform for every inspection,{" "}
            <span className="text-primary">design, and report.</span>
          </h2>
          <p className="text-gray-400 text-sm leading-relaxed">
            Coordinate site engineers, track every job from intake to sign-off, and keep documentation audit-ready — purpose-built for residential structural engineering teams.
          </p>
        </motion.div>

        {/* Footer tagline */}
        <motion.div
          className="relative z-10 pt-6 border-t border-white/10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7, duration: 0.6 }}
        >
          <p className="text-xs text-gray-500 tracking-wide uppercase">
            Vivid Engineering · Residential Structural Inspections &amp; Designs
          </p>
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
              <img src={logoImg} alt="Vivid OPS" className="h-20 w-auto object-contain" />
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
                    Use your Vivid Engineering credentials to access the operations console.
                  </p>
                </motion.div>

                {errors.form && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mb-4 px-3 py-2.5 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex items-center gap-2"
                  >
                    <span>{errors.form}</span>
                  </motion.div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5" noValidate>
                  {/* Role selector */}
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.22 }}
                  >
                    <label className="block text-sm font-medium text-gray-700 mb-2">Sign in as</label>
                    <div className="grid grid-cols-4 gap-1.5 bg-gray-100 p-1 rounded-xl">
                      {(Object.keys(ROLES) as Role[]).map((r) => {
                        const cfg = ROLES[r];
                        const RIcon = cfg.icon;
                        const active = role === r;
                        return (
                          <motion.button
                            key={r}
                            type="button"
                            onClick={() => setRole(r)}
                            whileTap={{ scale: 0.95 }}
                            className={`relative flex flex-col items-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition-colors ${active ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
                          >
                            {active && (
                              <motion.div
                                layoutId="loginRole"
                                className="absolute inset-0 bg-primary rounded-lg pointer-events-none"
                                transition={{ type: "spring", stiffness: 350, damping: 28 }}
                              />
                            )}
                            <span className="relative flex flex-col items-center gap-1">
                              <RIcon size={14} />
                              <span className="leading-none whitespace-nowrap">
                                {r === "super-admin" ? "Super" : r === "admin" ? "Admin" : r === "supervisor" ? "Super." : "User"}
                              </span>
                            </span>
                          </motion.button>
                        );
                      })}
                    </div>
                  </motion.div>

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

                {/* Footer note */}
                <motion.p
                  className="text-center text-xs text-gray-400 mt-8"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  Need access? Contact your administrator at Vivid Engineering.
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
              Back to Vivid OPS
            </motion.span>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
