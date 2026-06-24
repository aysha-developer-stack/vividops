import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Loader2, Mail, MessageSquare, Bell, ArrowLeft } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

interface Template {
  id: string;
  name: string;
  emailSubject: string;
  emailBody: string;
  cliqTemplate: string;
  inAppTemplate: string;
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "assigned",
    name: "Job Assignment",
    emailSubject: "New Job Assigned: {jobTitle}",
    emailBody: "Hello {userName},\n\nYou have been assigned to a new job: {jobTitle}.\nClient: {clientName}\nDue Date: {dueDate}",
    cliqTemplate: "New Job: {jobTitle} for {clientName}",
    inAppTemplate: "You have been assigned to {jobTitle}",
  },
  {
    id: "overdue",
    name: "Overdue Job",
    emailSubject: "URGENT: Job Overdue - {jobTitle}",
    emailBody: "The job {jobTitle} is now overdue by {daysOverdue} days.",
    cliqTemplate: "JOB OVERDUE: {jobTitle}",
    inAppTemplate: "{jobTitle} is overdue!",
  },
];

export default function NotificationTemplates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [selectedId, setSelectedId] = useState("assigned");
  const [saving, setSaving] = useState(false);

  const selected = templates.find(t => t.id === selectedId) || templates[0];

  const handleSave = async () => {
    setSaving(true);
    try {
      // API call would go here
      await new Promise(resolve => setTimeout(resolve, 800));
      toast({ title: "Template saved", description: `${selected.name} template updated successfully.` });
    } catch (err) {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateSelected = (patch: Partial<Template>) => {
    setTemplates(prev => prev.map(t => t.id === selectedId ? { ...t, ...patch } : t));
  };

  if (user?.role !== "super-admin" && user?.role !== "admin") {
    return <div>Access Denied</div>;
  }

  return (
    <DashboardLayout title="Notification Templates">
      <div className="max-w-5xl mx-auto">
        <button 
          onClick={() => setLocation("/super-admin/settings")} 
          className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 transition-colors"
        >
          <ArrowLeft size={16} /> Back to Settings
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-8">
          {/* Sidebar */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider px-3 mb-3">Event Templates</h3>
            {templates.map(t => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all ${selectedId === t.id ? "bg-primary text-white shadow-md" : "bg-white text-gray-600 hover:bg-gray-50 border border-gray-100"}`}
              >
                {t.name}
              </button>
            ))}
          </div>

          {/* Editor */}
          <motion.div 
            key={selectedId}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-white border border-gray-100 rounded-2xl p-6 md:p-8 shadow-sm"
          >
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-xl font-bold text-gray-900">{selected.name}</h2>
                <p className="text-sm text-gray-500">Configure how this notification looks across channels.</p>
              </div>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-sky-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Save Changes
              </button>
            </div>

            <div className="space-y-8">
              {/* In-App */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                    <Bell size={18} />
                  </div>
                  <h4 className="font-bold text-gray-900">In-App Notification</h4>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Message Template</label>
                  <input
                    value={selected.inAppTemplate}
                    onChange={(e) => updateSelected({ inAppTemplate: e.target.value })}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </section>

              {/* Email */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                    <Mail size={18} />
                  </div>
                  <h4 className="font-bold text-gray-900">Email Notification</h4>
                </div>
                <div className="space-y-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Subject Line</label>
                    <input
                      value={selected.emailSubject}
                      onChange={(e) => updateSelected({ emailSubject: e.target.value })}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Email Body</label>
                    <textarea
                      value={selected.emailBody}
                      onChange={(e) => updateSelected({ emailBody: e.target.value })}
                      rows={5}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                    />
                  </div>
                </div>
              </section>

              {/* Zoho Cliq */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                    <MessageSquare size={18} />
                  </div>
                  <h4 className="font-bold text-gray-900">Zoho Cliq Notification</h4>
                </div>
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Message Template</label>
                  <textarea
                    value={selected.cliqTemplate}
                    onChange={(e) => updateSelected({ cliqTemplate: e.target.value })}
                    rows={2}
                    className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary resize-none"
                  />
                </div>
              </section>

              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                <h5 className="text-xs font-bold text-blue-800 uppercase mb-2">Available Placeholders</h5>
                <div className="flex flex-wrap gap-2">
                  {["{userName}", "{jobTitle}", "{jobSerial}", "{clientName}", "{dueDate}", "{daysOverdue}"].map(p => (
                    <code key={p} className="text-[10px] bg-white border border-blue-200 px-2 py-1 rounded-md text-blue-700 font-mono">
                      {p}
                    </code>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </DashboardLayout>
  );
}
