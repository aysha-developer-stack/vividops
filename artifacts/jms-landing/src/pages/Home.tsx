import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import {
  motion,
  useAnimation,
  useInView,
  useMotionValue,
  useTransform,
  AnimatePresence,
  useSpring,
} from "framer-motion";
import {
  CheckCircle2,
  Clock,
  MessageSquare,
  BarChart3,
  FileText,
  ShieldCheck,
  ArrowRight,
  Menu,
  X,
  Briefcase,
  Users,
  Zap,
  TrendingUp,
  Shield,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImg from "@assets/www.vividengineering.com.au__1776407417497.png";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay },
  }),
};

const fadeLeft = {
  hidden: { opacity: 0, x: -40 },
  visible: (delay = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay },
  }),
};

const fadeRight = {
  hidden: { opacity: 0, x: 40 },
  visible: (delay = 0) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1], delay },
  }),
};

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    let start = 0;
    const duration = 1800;
    const step = 16;
    const increment = (target / duration) * step;
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, step);
    return () => clearInterval(timer);
  }, [inView, target]);

  return <span ref={ref}>{count}{suffix}</span>;
}

function TiltCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useTransform(y, [-60, 60], [8, -8]);
  const rotateY = useTransform(x, [-60, 60], [-8, 8]);
  const springRotateX = useSpring(rotateX, { stiffness: 300, damping: 30 });
  const springRotateY = useSpring(rotateY, { stiffness: 300, damping: 30 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set(e.clientX - rect.left - rect.width / 2);
    y.set(e.clientY - rect.top - rect.height / 2);
  }, [x, y]);

  const handleMouseLeave = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.div
      ref={ref}
      style={{ rotateX: springRotateX, rotateY: springRotateY, transformStyle: "preserve-3d", perspective: 800 }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function FloatingBlob({ className }: { className: string }) {
  return (
    <motion.div
      className={`absolute rounded-full blur-3xl pointer-events-none ${className}`}
      animate={{
        scale: [1, 1.2, 1],
        x: [0, 20, -10, 0],
        y: [0, -15, 10, 0],
      }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

const features = [
  { icon: ShieldCheck, title: "Role-Based Access", desc: "Granular controls for Super Admins, Admins, Supervisors, and Users. Everyone sees exactly what they need.", color: "from-blue-500 to-cyan-400" },
  { icon: Briefcase, title: "Job Tracking & Assignment", desc: "Create jobs, assign teams, set deadlines, and track status in real-time from anywhere.", color: "from-sky-500 to-blue-400" },
  { icon: Clock, title: "Smart Time Tracking", desc: "Built-in timers for accurate billing and performance tracking. Know exactly how long tasks take.", color: "from-cyan-500 to-teal-400" },
  { icon: MessageSquare, title: "Communication Integration", desc: "Seamlessly connects with tools like Zoho Cliq to keep all job-related chatter in context.", color: "from-blue-600 to-sky-400" },
  { icon: BarChart3, title: "Reports & Analytics", desc: "Generate performance reports instantly. Identify bottlenecks and reward top performers.", color: "from-sky-600 to-cyan-400" },
  { icon: FileText, title: "File & Checklist Management", desc: "Attach manuals, photos, and create mandatory checklists that must be completed.", color: "from-teal-500 to-cyan-500" },
];

const steps = [
  { step: "01", title: "Create & Assign", desc: "Managers create detailed jobs with checklists and assign them to the right field technicians.", icon: Briefcase },
  { step: "02", title: "Work & Track", desc: "Users receive notifications, start the smart timer, complete checklists, and upload photos.", icon: Clock },
  { step: "03", title: "Review & Analyze", desc: "Supervisors review completed work, while admins get aggregated performance data.", icon: BarChart3 },
];

const benefits = [
  { icon: Zap, text: "Increase overall team productivity", stat: "34%" },
  { icon: Activity, text: "Real-time collaboration and updates", stat: "99.9%" },
  { icon: TrendingUp, text: "Better job tracking and visibility", stat: "2×" },
  { icon: Shield, text: "Proactive error monitoring and reporting", stat: "60%" },
];

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [activeJob, setActiveJob] = useState(0);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setActiveJob(j => (j + 1) % 3), 2200);
    return () => clearInterval(timer);
  }, []);

  const jobs = [
    { title: "Server Maintenance #482", status: "In Progress", color: "bg-sky-100 text-sky-700 border-sky-200", progress: 65 },
    { title: "Site Inspection - North", status: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", progress: 0 },
    { title: "Quarterly Audit", status: "Completed", color: "bg-green-100 text-green-700 border-green-200", progress: 100 },
  ];

  return (
    <div className="min-h-screen bg-white text-foreground flex flex-col overflow-x-hidden selection:bg-primary/20">

      {/* Navigation */}
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 border-b ${
          isScrolled ? "bg-black/95 backdrop-blur-md border-white/10 shadow-lg shadow-black/30 py-3" : "bg-black border-white/5 py-5"
        }`}
      >
        <div className="container mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center group">
            <motion.img
              src={logoImg}
              alt="Vivid Engineering"
              className="h-10 w-auto object-contain"
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 400, damping: 20 }}
            />
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {["Home", "Features", "About"].map((item) => (
              <motion.a
                key={item}
                href={item === "Home" ? "/" : `#${item.toLowerCase()}`}
                className="text-sm font-medium text-gray-300 hover:text-white transition-colors relative group"
                whileHover={{ y: -1 }}
              >
                {item}
                <motion.span
                  className="absolute -bottom-1 left-0 h-0.5 bg-primary rounded-full"
                  initial={{ width: 0 }}
                  whileHover={{ width: "100%" }}
                  transition={{ duration: 0.2 }}
                />
              </motion.a>
            ))}
          </nav>

          <div className="hidden md:flex items-center">
            <Link href="/login">
              <motion.div whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
                <Button className="relative bg-primary hover:bg-primary/90 text-white rounded-full px-6 shadow-md overflow-hidden group cursor-pointer">
                  <span className="relative z-10">Login</span>
                  <motion.div
                    className="absolute inset-0 bg-white/20 rounded-full"
                    initial={{ scale: 0, opacity: 0 }}
                    whileHover={{ scale: 1.5, opacity: 1 }}
                    transition={{ duration: 0.4 }}
                  />
                </Button>
              </motion.div>
            </Link>
          </div>

          <motion.button
            className="md:hidden text-gray-300 p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            whileTap={{ scale: 0.9 }}
          >
            <AnimatePresence mode="wait">
              {mobileMenuOpen
                ? <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }}><X size={24} /></motion.div>
                : <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }}><Menu size={24} /></motion.div>
              }
            </AnimatePresence>
          </motion.button>
        </div>

        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="md:hidden overflow-hidden bg-black border-b border-white/10 shadow-xl"
            >
              <div className="p-4 flex flex-col gap-2">
                {["Home", "Features", "About"].map((item, i) => (
                  <motion.a
                    key={item}
                    href={item === "Home" ? "/" : `#${item.toLowerCase()}`}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ delay: i * 0.06 }}
                    className="block p-3 text-gray-300 font-medium hover:bg-white/10 hover:text-white rounded-md transition-colors"
                  >
                    {item}
                  </motion.a>
                ))}
                <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.18 }}>
                  <Link href="/login">
                    <Button className="w-full bg-primary hover:bg-primary/90 text-white mt-2 cursor-pointer">Login</Button>
                  </Link>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      <main className="flex-1 pt-24 md:pt-32">

        {/* ── HERO ── */}
        <section className="relative overflow-hidden pb-24 pt-10 md:pt-20">
          <FloatingBlob className="top-0 right-0 -mr-32 -mt-32 w-[600px] h-[600px] bg-primary/8" />
          <FloatingBlob className="bottom-0 left-0 -ml-32 -mb-32 w-[500px] h-[500px] bg-sky-400/6" />
          <motion.div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[900px] rounded-full border border-gray-100/60 pointer-events-none"
            animate={{ rotate: 360 }}
            transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          />

          <div className="container mx-auto px-6 md:px-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center">

              {/* Left copy */}
              <div className="max-w-2xl">
                <motion.div
                  custom={0}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="inline-flex items-center gap-2 mb-6 px-4 py-1.5 rounded-full bg-sky-50 border border-sky-100 text-primary text-xs font-semibold tracking-wider uppercase"
                >
                  <motion.span
                    className="w-1.5 h-1.5 rounded-full bg-primary"
                    animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  The Command Center for Ops Teams
                </motion.div>

                <motion.h1
                  custom={0.1}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.1] mb-6"
                >
                  Manage Jobs Efficiently in{" "}
                  <motion.span
                    className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-sky-400 inline-block"
                    animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "linear" }}
                  >
                    One Place
                  </motion.span>
                </motion.h1>

                <motion.p
                  custom={0.2}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="text-lg md:text-xl text-gray-600 mb-8 leading-relaxed max-w-xl"
                >
                  Track progress, assign tasks, manage teams, and improve productivity without the chaos of spreadsheets and chat apps.
                </motion.p>

                <motion.div
                  custom={0.3}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="flex flex-col sm:flex-row gap-4"
                >
                  <Link href="/login">
                  <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      size="lg"
                      className="relative bg-primary hover:bg-primary/90 text-white rounded-full px-8 h-14 text-base font-medium shadow-lg shadow-primary/30 overflow-hidden w-full sm:w-auto flex items-center justify-center gap-2 group cursor-pointer"
                    >
                      <span className="relative z-10 flex items-center gap-2">
                        Login
                        <motion.span
                          animate={{ x: [0, 4, 0] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                        >
                          <ArrowRight size={18} />
                        </motion.span>
                      </span>
                      <motion.div
                        className="absolute inset-0 bg-gradient-to-r from-sky-400/30 to-transparent"
                        initial={{ x: "-100%" }}
                        whileHover={{ x: "100%" }}
                        transition={{ duration: 0.5 }}
                      />
                    </Button>
                  </motion.div>
                  </Link>
                  <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-full px-8 h-14 text-base font-medium border-gray-200 text-gray-700 hover:border-primary hover:text-primary w-full sm:w-auto transition-colors duration-300"
                    >
                      View Features
                    </Button>
                  </motion.div>
                </motion.div>

                <motion.div
                  custom={0.4}
                  initial="hidden"
                  animate="visible"
                  variants={fadeUp}
                  className="mt-10 flex items-center gap-4 text-sm text-gray-500 font-medium"
                >
                  <div className="flex -space-x-2">
                    {[1, 2, 3, 4].map((i) => (
                      <motion.div
                        key={i}
                        initial={{ x: -10, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.5 + i * 0.07 }}
                        className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 overflow-hidden"
                      >
                        <img src={`https://i.pravatar.cc/100?img=${i + 10}`} alt="Avatar" className="w-full h-full object-cover" />
                      </motion.div>
                    ))}
                  </div>
                  <p>Trusted by <strong className="text-gray-700">10,000+</strong> operations teams</p>
                </motion.div>
              </div>

              {/* Dashboard Mockup */}
              <motion.div
                initial={{ opacity: 0, x: 40, rotateY: -10 }}
                animate={{ opacity: 1, x: 0, rotateY: 0 }}
                transition={{ duration: 1, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                style={{ perspective: 1200 }}
                className="relative lg:h-[600px] flex items-center"
              >
                <motion.div
                  className="relative w-full max-w-[600px] mx-auto rounded-xl border border-gray-200/60 bg-white shadow-2xl shadow-gray-300/40 overflow-hidden"
                  whileHover={{ y: -6, boxShadow: "0 40px 80px -12px rgba(11,126,185,0.18)" }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                >
                  <div className="h-12 bg-gray-50 border-b border-gray-100 flex items-center px-4 gap-2">
                    <div className="flex gap-1.5">
                      {["bg-red-400", "bg-amber-400", "bg-green-400"].map((c, i) => (
                        <motion.div key={i} className={`w-3 h-3 rounded-full ${c}`} whileHover={{ scale: 1.3 }} />
                      ))}
                    </div>
                    <div className="mx-auto bg-white border border-gray-200 rounded-md px-24 py-1 text-xs text-gray-400">
                      app.jobflow.io
                    </div>
                  </div>

                  <div className="p-5 flex gap-5 bg-gray-50/50 h-[420px]">
                    <div className="w-44 hidden sm:flex flex-col gap-1.5">
                      {[
                        { label: "Active Jobs", icon: Briefcase, active: true },
                        { label: "Team", icon: Users, active: false },
                        { label: "Reports", icon: BarChart3, active: false },
                      ].map(({ label, icon: Icon, active }, i) => (
                        <motion.div
                          key={i}
                          className={`h-9 rounded-md flex items-center px-3 text-sm font-medium cursor-pointer transition-colors ${active ? "bg-primary/10 text-primary" : "text-gray-600 hover:bg-gray-100"}`}
                          whileHover={{ x: 3 }}
                          transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        >
                          <Icon size={14} className="mr-2 shrink-0" /> {label}
                        </motion.div>
                      ))}

                      <motion.div
                        className="mt-auto p-3 bg-white border border-gray-100 rounded-lg shadow-sm"
                        animate={{ boxShadow: ["0 1px 3px rgba(11,126,185,0.1)", "0 4px 12px rgba(11,126,185,0.2)", "0 1px 3px rgba(11,126,185,0.1)"] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                      >
                        <div className="text-xs text-gray-500 font-medium mb-2">Active Timer</div>
                        <AnimatedTimerDisplay />
                      </motion.div>
                    </div>

                    <div className="flex-1 flex flex-col gap-3">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="text-base font-bold text-gray-800">Job Dashboard</div>
                          <div className="text-xs text-gray-500">Overview of all active operations</div>
                        </div>
                        <motion.div
                          className="h-8 bg-primary text-white text-xs font-medium px-3 rounded-md flex items-center cursor-pointer"
                          whileHover={{ scale: 1.05, boxShadow: "0 4px 12px rgba(11,126,185,0.4)" }}
                          whileTap={{ scale: 0.95 }}
                        >
                          New Job
                        </motion.div>
                      </div>

                      <div className="flex flex-col gap-2.5 flex-1 overflow-hidden">
                        {jobs.map((job, i) => (
                          <motion.div
                            key={i}
                            className={`bg-white p-3 rounded-lg border shadow-sm cursor-pointer transition-colors ${activeJob === i ? "border-primary/30 shadow-md" : "border-gray-100"}`}
                            whileHover={{ scale: 1.02, boxShadow: "0 4px 16px rgba(11,126,185,0.12)" }}
                            animate={activeJob === i ? { x: [0, 2, 0] } : {}}
                            transition={{ type: "spring", stiffness: 300, damping: 25 }}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-medium text-xs text-gray-800">{job.title}</div>
                              <span className={`text-[9px] px-2 py-0.5 rounded-full font-semibold border ${job.color}`}>{job.status}</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <div className="flex -space-x-1.5">
                                <div className="w-4 h-4 rounded-full bg-gray-200 border border-white" />
                                <div className="w-4 h-4 rounded-full bg-primary/30 border border-white" />
                              </div>
                              <div className="h-1.5 w-20 bg-gray-100 rounded-full overflow-hidden">
                                <motion.div
                                  className="h-full bg-primary rounded-full"
                                  initial={{ width: 0 }}
                                  animate={{ width: `${job.progress}%` }}
                                  transition={{ duration: 1.2, delay: 0.5 + i * 0.2, ease: "easeOut" }}
                                />
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </div>
                </motion.div>

                {/* Floating badge */}
                <motion.div
                  className="absolute top-8 -right-4 bg-white px-4 py-3 rounded-xl shadow-xl border border-gray-100 flex items-center gap-3 z-20"
                  initial={{ opacity: 0, scale: 0.5, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: [0, -6, 0] }}
                  transition={{
                    opacity: { delay: 1, duration: 0.5 },
                    scale: { delay: 1, duration: 0.5 },
                    x: { delay: 1, duration: 0.5 },
                    y: { delay: 1.5, duration: 3, repeat: Infinity, ease: "easeInOut" },
                  }}
                >
                  <motion.div
                    className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center text-green-600"
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  >
                    <CheckCircle2 size={18} />
                  </motion.div>
                  <div>
                    <div className="text-sm font-bold text-gray-800">Job Complete</div>
                    <div className="text-xs text-gray-400">Just now</div>
                  </div>
                </motion.div>

                {/* Secondary floating badge */}
                <motion.div
                  className="absolute bottom-16 -left-4 bg-white px-4 py-3 rounded-xl shadow-xl border border-gray-100 flex items-center gap-3 z-20"
                  initial={{ opacity: 0, scale: 0.5, x: -20 }}
                  animate={{ opacity: 1, scale: 1, x: 0, y: [0, 5, 0] }}
                  transition={{
                    opacity: { delay: 1.4, duration: 0.5 },
                    scale: { delay: 1.4, duration: 0.5 },
                    x: { delay: 1.4, duration: 0.5 },
                    y: { delay: 2, duration: 3.5, repeat: Infinity, ease: "easeInOut" },
                  }}
                >
                  <motion.div
                    className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary"
                    animate={{ rotate: [0, 10, -10, 0] }}
                    transition={{ duration: 3, repeat: Infinity }}
                  >
                    <Clock size={18} />
                  </motion.div>
                  <div>
                    <div className="text-sm font-bold text-gray-800">Timer Running</div>
                    <div className="text-xs text-gray-400">3 active jobs</div>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* ── FEATURES ── */}
        <section id="features" className="py-24 bg-gray-50/60 border-y border-gray-100 overflow-hidden">
          <div className="container mx-auto px-6 md:px-12">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              custom={0}
              className="text-center max-w-3xl mx-auto mb-16"
            >
              <p className="text-primary font-semibold text-sm uppercase tracking-widest mb-3">Features</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Everything you need to run operations</h2>
              <p className="text-lg text-gray-600">Built specifically for teams that need to coordinate complex work across multiple locations and roles.</p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {features.map((feature, i) => (
                <TiltCard key={i} className="h-full">
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ delay: i * 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ boxShadow: "0 20px 60px -12px rgba(11,126,185,0.2)" }}
                    className="bg-white h-full p-8 rounded-2xl border border-gray-100 shadow-sm cursor-default group relative overflow-hidden"
                  >
                    <motion.div
                      className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-2xl"
                    />
                    <motion.div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 shadow-md relative z-10`}
                      whileHover={{ scale: 1.15, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <feature.icon size={22} className="text-white" />
                    </motion.div>
                    <h3 className="text-xl font-bold text-gray-900 mb-3 relative z-10">{feature.title}</h3>
                    <p className="text-gray-600 leading-relaxed relative z-10">{feature.desc}</p>
                    <motion.div
                      className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-primary to-sky-400 rounded-full"
                      initial={{ width: 0 }}
                      whileHover={{ width: "100%" }}
                      transition={{ duration: 0.4 }}
                    />
                  </motion.div>
                </TiltCard>
              ))}
            </div>
          </div>
        </section>

        {/* ── HOW IT WORKS ── */}
        <section className="py-24 bg-white overflow-hidden">
          <div className="container mx-auto px-6 md:px-12">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={0}
              className="text-center max-w-3xl mx-auto mb-20"
            >
              <p className="text-primary font-semibold text-sm uppercase tracking-widest mb-3">How It Works</p>
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">From assignment to completion</h2>
              <p className="text-lg text-gray-600">A streamlined 3-step process designed for field operations teams.</p>
            </motion.div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto relative">
              {/* Animated connector lines */}
              <div className="hidden md:block absolute top-12 left-[calc(33.33%+0px)] right-[calc(33.33%+0px)] h-px overflow-hidden">
                <motion.div
                  className="h-full bg-gradient-to-r from-primary to-sky-400"
                  initial={{ scaleX: 0, originX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.2, delay: 0.5, ease: "easeOut" }}
                />
              </div>

              {steps.map((item, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                  className="relative text-center group"
                >
                  <motion.div
                    className="w-24 h-24 mx-auto mb-6 rounded-full bg-white border-2 border-gray-100 flex items-center justify-center relative shadow-md"
                    whileHover={{ scale: 1.1, borderColor: "hsl(200 89% 38%)", boxShadow: "0 0 0 6px rgba(11,126,185,0.12)" }}
                    transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  >
                    <motion.div
                      className="absolute inset-0 rounded-full bg-primary/10"
                      initial={{ scale: 0 }}
                      whileInView={{ scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.4 + i * 0.2, duration: 0.4 }}
                    />
                    <div className="relative z-10 flex flex-col items-center">
                      <item.icon size={24} className="text-primary mb-1" />
                      <span className="text-xs font-bold text-primary">{item.step}</span>
                    </div>
                    <motion.div
                      className="absolute -inset-1 rounded-full border-2 border-primary/20"
                      animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
                      transition={{ duration: 2.5, repeat: Infinity, delay: i * 0.4 }}
                    />
                  </motion.div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── BENEFITS ── */}
        <section id="about" className="py-24 bg-black text-white overflow-hidden relative">
          <FloatingBlob className="top-0 right-0 -mr-40 -mt-40 w-[600px] h-[600px] bg-primary/20" />
          <FloatingBlob className="bottom-0 left-0 -ml-40 -mb-40 w-[500px] h-[500px] bg-sky-600/10" />

          <div className="container mx-auto px-6 md:px-12 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">

              <div>
                <motion.p
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeLeft}
                  custom={0}
                  className="text-primary font-semibold text-sm uppercase tracking-widest mb-4"
                >
                  Why JobFlow
                </motion.p>
                <motion.h2
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeLeft}
                  custom={0.1}
                  className="text-3xl md:text-4xl font-bold mb-6 leading-tight"
                >
                  Why operations teams choose JobFlow
                </motion.h2>
                <motion.p
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeLeft}
                  custom={0.2}
                  className="text-gray-400 text-lg mb-10 leading-relaxed"
                >
                  Stop losing critical information in email threads and messy spreadsheets. JobFlow brings order to operations.
                </motion.p>

                <div className="space-y-5">
                  {benefits.map((benefit, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: -30 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.5 }}
                      whileHover={{ x: 6 }}
                      className="flex items-center gap-4 p-4 rounded-xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors cursor-default group"
                    >
                      <motion.div
                        className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center text-primary shrink-0"
                        whileHover={{ scale: 1.15, rotate: 10 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <benefit.icon size={18} />
                      </motion.div>
                      <span className="text-gray-200 font-medium flex-1">{benefit.text}</span>
                      <span className="text-primary font-bold text-lg">{benefit.stat}</span>
                    </motion.div>
                  ))}
                </div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.7, duration: 0.5 }}
                  className="mt-10"
                >
                  <motion.div whileHover={{ scale: 1.04, y: -2 }} whileTap={{ scale: 0.97 }}>
                    <Button
                      size="lg"
                      className="relative bg-white text-gray-900 hover:bg-gray-100 rounded-full px-8 font-semibold overflow-hidden group"
                    >
                      <span className="relative z-10">Get Started Today</span>
                      <motion.div
                        className="absolute inset-0 bg-primary/10"
                        initial={{ x: "-100%" }}
                        whileHover={{ x: "0%" }}
                        transition={{ duration: 0.3 }}
                      />
                    </Button>
                  </motion.div>
                </motion.div>
              </div>

              {/* Animated stat orb */}
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeRight}
                custom={0.2}
                className="relative flex items-center justify-center"
              >
                <div className="relative w-80 h-80 flex items-center justify-center">
                  {[1, 1.18, 1.36].map((scale, i) => (
                    <motion.div
                      key={i}
                      className="absolute inset-0 rounded-full border border-white/10"
                      style={{ scale }}
                      animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
                      transition={{ duration: 20 + i * 8, repeat: Infinity, ease: "linear" }}
                    />
                  ))}

                  <motion.div
                    className="w-60 h-60 bg-zinc-900 rounded-full flex flex-col items-center justify-center border border-zinc-800 shadow-2xl relative z-10"
                    whileHover={{ scale: 1.05, boxShadow: "0 0 60px rgba(11,126,185,0.4)" }}
                    transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  >
                    <motion.div
                      className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-sky-400 flex items-center justify-center mb-4 shadow-lg"
                      animate={{ rotate: [0, 5, -5, 0] }}
                      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <BarChart3 size={28} className="text-white" />
                    </motion.div>
                    <div className="text-5xl font-black text-white mb-1">
                      <AnimatedCounter target={34} suffix="%" />
                    </div>
                    <div className="text-gray-400 text-xs font-semibold uppercase tracking-widest text-center px-4">
                      Average Productivity Increase
                    </div>
                  </motion.div>

                  {/* Orbiting dots */}
                  {[0, 120, 240].map((angle, i) => (
                    <motion.div
                      key={i}
                      className="absolute w-3 h-3 rounded-full bg-primary"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 6 + i * 2, repeat: Infinity, ease: "linear" }}
                      style={{
                        transformOrigin: "150px center",
                        top: "50%",
                        left: "50%",
                        marginTop: -6,
                        marginLeft: -6 - 150,
                        rotate: `${angle}deg`,
                      }}
                    />
                  ))}
                </div>
              </motion.div>
            </div>
          </div>
        </section>
      </main>

      {/* ── FOOTER ── */}
      <footer className="bg-black text-white relative overflow-hidden">
        {/* Subtle animated background glow */}
        <motion.div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] rounded-full bg-primary/10 blur-3xl pointer-events-none"
          animate={{ scale: [1, 1.1, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Top gradient line */}
        <div className="h-px bg-gradient-to-r from-transparent via-primary to-transparent" />

        {/* CTA Banner */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative z-10 border-b border-white/10 py-14"
        >
          <div className="container mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-6">
            <div>
              <h3 className="text-2xl md:text-3xl font-bold mb-2">Ready to streamline your operations?</h3>
              <p className="text-gray-400">Join thousands of teams already using JobFlow to manage their work.</p>
            </div>
            <motion.div whileHover={{ scale: 1.05, y: -2 }} whileTap={{ scale: 0.97 }} className="shrink-0">
              <Button
                size="lg"
                className="relative bg-primary hover:bg-primary/90 text-white rounded-full px-8 font-semibold shadow-lg shadow-primary/30 overflow-hidden group"
              >
                <span className="relative z-10 flex items-center gap-2">
                  Get Started Free
                  <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.5, repeat: Infinity }}>
                    <ArrowRight size={18} />
                  </motion.span>
                </span>
                <motion.div
                  className="absolute inset-0 bg-gradient-to-r from-sky-400/30 to-transparent"
                  initial={{ x: "-100%" }}
                  whileHover={{ x: "100%" }}
                  transition={{ duration: 0.5 }}
                />
              </Button>
            </motion.div>
          </div>
        </motion.div>

        {/* Main Footer Grid */}
        <div className="relative z-10 container mx-auto px-6 md:px-12 py-14">
          <div className="grid md:grid-cols-4 gap-10">
            {/* Brand column */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="md:col-span-2"
            >
              <motion.img
                src={logoImg}
                alt="Vivid Engineering"
                className="h-10 w-auto object-contain mb-5"
                whileHover={{ scale: 1.04 }}
                transition={{ type: "spring", stiffness: 400 }}
              />
              <p className="text-gray-400 text-sm leading-relaxed max-w-sm mb-6">
                JobFlow is the command center for operations teams — helping you assign jobs, track time, manage files, and report performance all in one place.
              </p>
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-2 h-2 rounded-full bg-green-400"
                  animate={{ scale: [1, 1.4, 1], opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                />
                <span className="text-xs text-gray-400 font-medium">All systems operational</span>
              </div>
            </motion.div>

            {/* Quick Links */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h4 className="text-sm font-semibold text-white uppercase tracking-widest mb-5">Product</h4>
              <ul className="space-y-3">
                {["Features", "How It Works", "Pricing", "Changelog", "Roadmap"].map((item) => (
                  <li key={item}>
                    <motion.a
                      href="#"
                      className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 group"
                      whileHover={{ x: 4 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                      <motion.span
                        className="w-1 h-1 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                      {item}
                    </motion.a>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Contact */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
            >
              <h4 className="text-sm font-semibold text-white uppercase tracking-widest mb-5">Company</h4>
              <ul className="space-y-3">
                {["About Us", "Privacy Policy", "Terms of Service", "Contact Support", "Security"].map((item) => (
                  <li key={item}>
                    <motion.a
                      href="#"
                      className="text-sm text-gray-400 hover:text-white transition-colors flex items-center gap-1.5 group"
                      whileHover={{ x: 4 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    >
                      <motion.span
                        className="w-1 h-1 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                      {item}
                    </motion.a>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="relative z-10 bg-primary">
          <div className="container mx-auto px-6 md:px-12 py-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-xs text-white/90 font-medium">
              &copy; {new Date().getFullYear()} Vivid Engineering Pty Ltd. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              {["Privacy", "Terms", "Contact"].map((link) => (
                <motion.a
                  key={link}
                  href="#"
                  className="text-xs text-white/80 hover:text-white transition-colors font-medium"
                  whileHover={{ y: -1 }}
                >
                  {link}
                </motion.a>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AnimatedTimerDisplay() {
  const [seconds, setSeconds] = useState(5045);
  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return (
    <div className="text-lg font-bold text-gray-800 flex items-center gap-1 tabular-nums">
      <Clock size={14} className="text-primary mr-1 shrink-0" />
      <motion.span key={h}>{h}</motion.span>:
      <motion.span key={m}>{m}</motion.span>:
      <AnimatePresence mode="popLayout">
        <motion.span
          key={s}
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 8, opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="inline-block"
        >
          {s}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}
