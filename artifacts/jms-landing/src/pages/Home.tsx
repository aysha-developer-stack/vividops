import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
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
  Play,
  Briefcase,
  Users
} from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } }
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

export default function Home() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-foreground flex flex-col selection:bg-primary/20">
      {/* Navigation */}
      <header 
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
          isScrolled ? "bg-white/90 backdrop-blur-md border-gray-200 shadow-sm py-3" : "bg-white border-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-6 md:px-12 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform">
              <Briefcase size={18} />
            </div>
            <span className="text-xl font-bold tracking-tight text-gray-900">JobFlow</span>
          </Link>
          
          <nav className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-sm font-medium text-gray-600 hover:text-primary transition-colors">Home</Link>
            <a href="#features" className="text-sm font-medium text-gray-600 hover:text-primary transition-colors">Features</a>
            <a href="#about" className="text-sm font-medium text-gray-600 hover:text-primary transition-colors">About</a>
          </nav>
          
          <div className="hidden md:flex items-center">
            <Button className="bg-primary hover:bg-primary/90 text-white rounded-full px-6 shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5">
              Login
            </Button>
          </div>

          <button 
            className="md:hidden text-gray-600 p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden absolute top-full left-0 right-0 bg-white border-b border-gray-100 shadow-lg p-4 flex flex-col gap-4">
            <Link href="/" className="block p-2 text-gray-800 font-medium hover:bg-gray-50 rounded-md">Home</Link>
            <a href="#features" className="block p-2 text-gray-800 font-medium hover:bg-gray-50 rounded-md">Features</a>
            <a href="#about" className="block p-2 text-gray-800 font-medium hover:bg-gray-50 rounded-md">About</a>
            <Button className="w-full bg-primary hover:bg-primary/90 text-white mt-2">Login</Button>
          </div>
        )}
      </header>

      <main className="flex-1 pt-24 md:pt-32">
        {/* Hero Section */}
        <section className="relative overflow-hidden pb-20 pt-10 md:pt-20">
          {/* Background decorative elements */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-[400px] h-[400px] rounded-full bg-blue-400/5 blur-3xl pointer-events-none" />
          
          <div className="container mx-auto px-6 md:px-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <motion.div 
                initial="hidden"
                animate="visible"
                variants={staggerContainer}
                className="max-w-2xl"
              >
                <motion.div variants={fadeIn} className="inline-block mb-4 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-primary text-xs font-semibold tracking-wide uppercase">
                  The Command Center for Ops Teams
                </motion.div>
                <motion.h1 variants={fadeIn} className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-gray-900 leading-[1.1] mb-6">
                  Manage Jobs Efficiently in <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-blue-500">One Place</span>
                </motion.h1>
                <motion.p variants={fadeIn} className="text-lg md:text-xl text-gray-600 mb-8 leading-relaxed max-w-xl">
                  Track progress, assign tasks, manage teams, and improve productivity without the chaos of spreadsheets and chat apps.
                </motion.p>
                <motion.div variants={fadeIn} className="flex flex-col sm:flex-row gap-4">
                  <Button size="lg" className="bg-primary hover:bg-primary/90 text-white rounded-full px-8 h-14 text-base font-medium shadow-lg hover:shadow-xl transition-all hover:-translate-y-1 w-full sm:w-auto flex items-center justify-center gap-2">
                    Login <ArrowRight size={18} />
                  </Button>
                  <Button size="lg" variant="outline" className="rounded-full px-8 h-14 text-base font-medium border-gray-200 text-gray-700 hover:bg-gray-50 hover:text-gray-900 w-full sm:w-auto flex items-center justify-center gap-2">
                    View Features
                  </Button>
                </motion.div>
                
                <motion.div variants={fadeIn} className="mt-10 flex items-center gap-4 text-sm text-gray-500 font-medium">
                  <div className="flex -space-x-2">
                    {[1,2,3,4].map(i => (
                      <div key={i} className="w-8 h-8 rounded-full border-2 border-white bg-gray-200 flex items-center justify-center overflow-hidden">
                        <img src={`https://i.pravatar.cc/100?img=${i+10}`} alt="Avatar" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                  <p>Trusted by 10,000+ operations teams</p>
                </motion.div>
              </motion.div>

              {/* Dashboard Mockup Illustration */}
              <motion.div 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative lg:h-[600px] flex items-center"
              >
                <div className="relative w-full max-w-[600px] mx-auto rounded-xl border border-gray-200/60 bg-white shadow-2xl shadow-gray-200/50 overflow-hidden">
                  {/* Mockup Header */}
                  <div className="h-12 bg-gray-50 border-b border-gray-100 flex items-center px-4 gap-2">
                    <div className="flex gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-400" />
                      <div className="w-3 h-3 rounded-full bg-amber-400" />
                      <div className="w-3 h-3 rounded-full bg-green-400" />
                    </div>
                    <div className="mx-auto bg-white border border-gray-200 rounded-md px-32 py-1 flex items-center">
                      <div className="w-3 h-3 text-gray-400"><CheckCircle2 size={12}/></div>
                    </div>
                  </div>
                  
                  {/* Mockup Body */}
                  <div className="p-5 flex gap-5 bg-gray-50/50 h-[450px]">
                    {/* Sidebar */}
                    <div className="w-48 hidden sm:flex flex-col gap-2">
                      <div className="h-8 bg-blue-50 text-primary rounded-md flex items-center px-3 text-sm font-medium"><Briefcase size={14} className="mr-2"/> Active Jobs</div>
                      <div className="h-8 hover:bg-gray-100 text-gray-600 rounded-md flex items-center px-3 text-sm font-medium transition-colors"><Users size={14} className="mr-2"/> Team</div>
                      <div className="h-8 hover:bg-gray-100 text-gray-600 rounded-md flex items-center px-3 text-sm font-medium transition-colors"><BarChart3 size={14} className="mr-2"/> Reports</div>
                      <div className="mt-auto p-3 bg-white border border-gray-100 rounded-lg shadow-sm">
                        <div className="text-xs text-gray-500 font-medium mb-2">Active Timer</div>
                        <div className="text-lg font-bold text-gray-800 flex items-center"><Clock size={16} className="text-primary mr-2"/> 01:24:05</div>
                      </div>
                    </div>
                    
                    {/* Main Content */}
                    <div className="flex-1 flex flex-col gap-4">
                      <div className="flex justify-between items-end">
                        <div>
                          <div className="text-lg font-bold text-gray-800">Job Dashboard</div>
                          <div className="text-xs text-gray-500">Overview of all active operations</div>
                        </div>
                        <div className="h-8 bg-primary text-white text-xs font-medium px-3 rounded-md flex items-center">New Job</div>
                      </div>
                      
                      {/* Job Cards */}
                      <div className="flex flex-col gap-3 flex-1 overflow-hidden">
                        {[
                          { title: "Server Maintenance #482", status: "In Progress", color: "bg-blue-100 text-blue-700", border: "border-blue-200" },
                          { title: "Site Inspection - North", status: "Pending", color: "bg-amber-100 text-amber-700", border: "border-amber-200" },
                          { title: "Quarterly Audit", status: "Completed", color: "bg-green-100 text-green-700", border: "border-green-200" }
                        ].map((job, i) => (
                          <div key={i} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
                            <div className="flex justify-between items-start mb-2">
                              <div className="font-medium text-sm text-gray-800">{job.title}</div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${job.color} ${job.border}`}>{job.status}</span>
                            </div>
                            <div className="flex justify-between items-center mt-3">
                              <div className="flex -space-x-1.5">
                                <div className="w-5 h-5 rounded-full bg-gray-200 border border-white"></div>
                                <div className="w-5 h-5 rounded-full bg-gray-300 border border-white"></div>
                              </div>
                              <div className="h-1.5 w-16 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-primary" style={{ width: i === 2 ? '100%' : i === 0 ? '65%' : '0%' }}></div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Decorative floating badge */}
                <div className="absolute top-10 -right-5 bg-white p-3 rounded-xl shadow-xl border border-gray-100 flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center text-green-600">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-gray-800">Job Complete</div>
                    <div className="text-xs text-gray-500">Just now</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-24 bg-gray-50/50 border-y border-gray-100">
          <div className="container mx-auto px-6 md:px-12">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Everything you need to run operations</h2>
              <p className="text-lg text-gray-600">Built specifically for teams that need to coordinate complex work across multiple locations and roles.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[
                { icon: ShieldCheck, title: "Role-Based Access", desc: "Granular controls for Super Admins, Admins, Supervisors, and Users. Everyone sees exactly what they need." },
                { icon: Briefcase, title: "Job Tracking & Assignment", desc: "Create jobs, assign teams, set deadlines, and track status in real-time from anywhere." },
                { icon: Clock, title: "Smart Time Tracking", desc: "Built-in timers for accurate billing and performance tracking. Know exactly how long tasks take." },
                { icon: MessageSquare, title: "Communication Integration", desc: "Seamlessly connects with tools like Zoho Cliq to keep all job-related chatter in context." },
                { icon: BarChart3, title: "Reports & Analytics", desc: "Generate performance reports instantly. Identify bottlenecks and reward top performers." },
                { icon: FileText, title: "File & Checklist Management", desc: "Attach manuals, photos, and create mandatory checklists that must be completed." }
              ].map((feature, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 group"
                >
                  <div className="w-12 h-12 rounded-lg bg-blue-50 text-primary flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <feature.icon size={24} />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{feature.title}</h3>
                  <p className="text-gray-600 leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-6 md:px-12">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">How JobFlow Works</h2>
              <p className="text-lg text-gray-600">A streamlined process from assignment to completion.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-12 max-w-5xl mx-auto">
              {[
                { step: "01", title: "Create & Assign", desc: "Managers create detailed jobs with checklists and assign them to the right field technicians." },
                { step: "02", title: "Work & Track", desc: "Users receive notifications, start the smart timer, complete checklists, and upload photos." },
                { step: "03", title: "Review & Analyze", desc: "Supervisors review completed work, while admins get aggregated performance data." }
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2, duration: 0.5 }}
                  className="relative text-center"
                >
                  {i !== 2 && (
                    <div className="hidden md:block absolute top-8 left-[60%] w-full h-px border-t-2 border-dashed border-gray-200"></div>
                  )}
                  <div className="w-16 h-16 mx-auto rounded-full bg-white border-4 border-blue-50 text-primary font-bold text-xl flex items-center justify-center relative z-10 mb-6 shadow-sm">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                  <p className="text-gray-600">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Benefits Section */}
        <section className="py-24 bg-gray-900 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 w-[800px] h-[800px] rounded-full bg-primary/20 blur-3xl pointer-events-none -mr-40 -mt-40" />
          
          <div className="container mx-auto px-6 md:px-12 relative z-10">
            <div className="grid lg:grid-cols-2 gap-16 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">Why operations teams choose JobFlow</h2>
                <p className="text-gray-300 text-lg mb-8 leading-relaxed">
                  Stop losing critical information in email threads and messy spreadsheets. JobFlow brings order to operations.
                </p>
                
                <div className="space-y-6">
                  {[
                    "Increase overall team productivity",
                    "Real-time collaboration and updates",
                    "Better job tracking and visibility",
                    "Proactive error monitoring and reporting"
                  ].map((benefit, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.1 }}
                      className="flex items-center gap-4"
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/30 text-blue-400 flex items-center justify-center shrink-0">
                        <CheckCircle2 size={14} />
                      </div>
                      <span className="text-gray-200 font-medium">{benefit}</span>
                    </motion.div>
                  ))}
                </div>
                
                <Button size="lg" className="mt-10 bg-white text-gray-900 hover:bg-gray-100 rounded-full px-8 font-semibold">
                  Get Started Today
                </Button>
              </div>
              
              <div className="relative">
                <div className="aspect-square max-w-[500px] mx-auto rounded-full border border-gray-800 flex items-center justify-center p-8 relative">
                  <div className="absolute inset-0 rounded-full border border-gray-700 scale-110"></div>
                  <div className="absolute inset-0 rounded-full border border-gray-800 scale-125"></div>
                  
                  <div className="w-full h-full bg-gray-800 rounded-full flex flex-col items-center justify-center p-8 text-center border border-gray-700 shadow-2xl relative z-10">
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center mb-6 shadow-lg shadow-primary/20">
                      <BarChart3 size={32} className="text-white" />
                    </div>
                    <div className="text-4xl font-bold text-white mb-2">34%</div>
                    <div className="text-gray-400 text-sm font-medium uppercase tracking-wider">Average Productivity Increase</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 pt-16 pb-8">
        <div className="container mx-auto px-6 md:px-12">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-12">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-primary text-white flex items-center justify-center">
                <Briefcase size={14} />
              </div>
              <span className="text-lg font-bold text-gray-900">JobFlow</span>
            </div>
            
            <div className="flex gap-8">
              <a href="#" className="text-sm font-medium text-gray-500 hover:text-primary transition-colors">Privacy Policy</a>
              <a href="#" className="text-sm font-medium text-gray-500 hover:text-primary transition-colors">Terms of Service</a>
              <a href="#" className="text-sm font-medium text-gray-500 hover:text-primary transition-colors">Contact Support</a>
            </div>
          </div>
          
          <div className="text-center text-gray-400 text-sm">
            &copy; {new Date().getFullYear()} JobFlow SaaS. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
