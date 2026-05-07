import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, BookOpen, Award, Clock, CheckCircle2,
  Search, GraduationCap, Megaphone, Image as ImageIcon, Video, Send,
  Users as UsersIcon, X, Pin, MoreVertical, Heart, MessageSquare,
  Paperclip, Calendar, Images, Film, Download, Eye,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";

const CATEGORIES = ["All", "Onboarding", "Safety", "Technical", "Leadership"];

const COURSES = [
  { id: 1, title: "Vivid OPS Platform Onboarding", category: "Onboarding", lessons: 8, duration: "1h 24m", progress: 100, level: "Beginner", thumb: "from-primary to-sky-700" },
  { id: 2, title: "Site Inspection Safety Fundamentals", category: "Safety", lessons: 12, duration: "2h 10m", progress: 75, level: "Beginner", thumb: "from-amber-500 to-orange-600" },
  { id: 3, title: "Advanced Job Scheduling", category: "Technical", lessons: 15, duration: "3h 45m", progress: 40, level: "Advanced", thumb: "from-emerald-500 to-emerald-700" },
  { id: 4, title: "Team Leadership Essentials", category: "Leadership", lessons: 10, duration: "2h 30m", progress: 0, level: "Intermediate", thumb: "from-purple-500 to-indigo-700" },
  { id: 5, title: "Inspection Tools & Equipment Certification", category: "Safety", lessons: 6, duration: "1h 05m", progress: 100, level: "Beginner", thumb: "from-red-500 to-rose-700" },
  { id: 6, title: "Reports & Analytics Mastery", category: "Technical", lessons: 9, duration: "1h 50m", progress: 0, level: "Intermediate", thumb: "from-cyan-500 to-blue-700" },
];

const LEVEL_COLOR: Record<string, string> = {
  Beginner: "bg-emerald-50 text-emerald-700",
  Intermediate: "bg-amber-50 text-amber-700",
  Advanced: "bg-red-50 text-red-700",
};

type Attachment =
  | { kind: "image"; url?: string; gradient?: string }
  | { kind: "video"; poster?: string; gradient?: string; duration?: string };

interface UpdatePost {
  id: number;
  author: string;
  authorRole: string;
  avatarColor: string;
  pinned?: boolean;
  body: string;
  attachments: Attachment[];
  postedAt: string;
  audience: string;
  reactions: number;
  comments: number;
  reacted?: boolean;
}

const SEED_POSTS: UpdatePost[] = [
  {
    id: 1,
    author: "Eng. Khalid Rahman",
    authorRole: "Principal Engineer",
    avatarColor: "from-primary to-sky-700",
    pinned: true,
    body:
      "Reminder: every roof inspection report must include moisture-meter readings on all four quadrants of the slab. Attaching the updated checklist and a 2-min walkthrough of the new template — please review before tomorrow's site visits.",
    attachments: [
      { kind: "video", gradient: "from-primary to-sky-800", duration: "2:14" },
      { kind: "image", gradient: "from-amber-400 to-orange-600" },
    ],
    postedAt: "Today · 8:02 AM",
    audience: "All users",
    reactions: 18,
    comments: 4,
  },
  {
    id: 2,
    author: "Sara Al-Mutairi",
    authorRole: "Operations Lead",
    avatarColor: "from-emerald-500 to-emerald-700",
    body:
      "Quick safety reminder for site engineers heading to high-rise inspections this week — harness checks before every climb, and log the serial number in the app. Photo below shows the correct anchor-point setup.",
    attachments: [
      { kind: "image", gradient: "from-red-500 to-rose-700" },
    ],
    postedAt: "Yesterday · 4:48 PM",
    audience: "All users",
    reactions: 32,
    comments: 7,
    reacted: true,
  },
  {
    id: 3,
    author: "Omar Hassan",
    authorRole: "Training Coordinator",
    avatarColor: "from-purple-500 to-indigo-700",
    body:
      "New training video on the updated structural drawing review workflow is live. Watch it before Thursday's design review — we'll do a short Q&A on the call.",
    attachments: [
      { kind: "video", gradient: "from-purple-600 to-indigo-800", duration: "5:46" },
    ],
    postedAt: "2 days ago",
    audience: "All users",
    reactions: 24,
    comments: 11,
  },
];

export default function Training({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const [tab, setTab] = useState<"updates" | "photos" | "videos" | "courses">("updates");
  const canPost = role !== "user";

  return (
    <DashboardLayout title="Training & Learning" role={role}>
      {/* Tabs */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-xl w-fit mb-6 flex-wrap">
        {[
          { id: "updates" as const, label: "Daily Updates", icon: Megaphone },
          { id: "photos" as const, label: "Photo Gallery", icon: Images },
          { id: "videos" as const, label: "Video Library", icon: Film },
          { id: "courses" as const, label: "Courses", icon: GraduationCap },
        ].map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-2 text-sm font-medium rounded-lg flex items-center gap-2 transition-colors ${active ? "text-white" : "text-gray-600 hover:text-gray-900"}`}
            >
              {active && (
                <motion.div
                  layoutId="trainingTab"
                  className="absolute inset-0 bg-primary rounded-lg pointer-events-none"
                  transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
              )}
              <Icon size={15} className="relative" />
              <span className="relative">{t.label}</span>
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "updates" && <DailyUpdates canPost={canPost} />}
          {tab === "photos" && <PhotoGallery canPost={canPost} />}
          {tab === "videos" && <VideoLibrary canPost={canPost} />}
          {tab === "courses" && <CoursesView />}
        </motion.div>
      </AnimatePresence>
    </DashboardLayout>
  );
}

/* -------------------------- Daily Updates -------------------------- */

function DailyUpdates({ canPost }: { canPost: boolean }) {
  const [posts, setPosts] = useState<UpdatePost[]>(SEED_POSTS);
  const [lightbox, setLightbox] = useState<Attachment | null>(null);

  const handlePost = (body: string, attachments: Attachment[]) => {
    const newPost: UpdatePost = {
      id: Date.now(),
      author: "You",
      authorRole: "Admin",
      avatarColor: "from-primary to-sky-700",
      body,
      attachments,
      postedAt: "Just now",
      audience: "All users",
      reactions: 0,
      comments: 0,
    };
    setPosts([newPost, ...posts]);
  };

  const toggleReact = (id: number) => {
    setPosts((p) =>
      p.map((post) =>
        post.id === id
          ? { ...post, reacted: !post.reacted, reactions: post.reactions + (post.reacted ? -1 : 1) }
          : post
      )
    );
  };

  const sorted = [...posts].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Feed */}
      <div className="lg:col-span-2 space-y-5">
        {canPost && <Composer onPost={handlePost} />}

        {sorted.map((post, i) => (
          <PostCard
            key={post.id}
            post={post}
            index={i}
            onReact={() => toggleReact(post.id)}
            onOpenAttachment={(a) => setLightbox(a)}
          />
        ))}
      </div>

      {/* Side panel */}
      <div className="space-y-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Megaphone size={17} />
            </div>
            <div>
              <div className="text-sm font-bold text-gray-900">About Daily Updates</div>
              <div className="text-xs text-gray-500">Broadcast to every team member</div>
            </div>
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            Share short training videos, site photos, safety reminders, and process notes with the entire Vivid Engineering team. Everyone sees the same feed in real time.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            {[
              { label: "Videos", icon: Video, color: "text-primary" },
              { label: "Pictures", icon: ImageIcon, color: "text-emerald-600" },
              { label: "Text", icon: MessageSquare, color: "text-amber-600" },
            ].map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.label} className="rounded-xl bg-gray-50 py-3">
                  <Icon size={18} className={`mx-auto ${f.color}`} />
                  <div className="text-[11px] font-medium text-gray-600 mt-1">{f.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="text-sm font-bold text-gray-900 mb-3">This week</div>
          <Stat label="Updates posted" value={posts.length} />
          <Stat label="Reactions" value={posts.reduce((a, p) => a + p.reactions, 0)} />
          <Stat label="Comments" value={posts.reduce((a, p) => a + p.comments, 0)} />
          <Stat label="Audience reach" value="All users" subtle />
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {lightbox && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightbox(null)}
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-6"
          >
            <button
              onClick={() => setLightbox(null)}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
            >
              <X size={20} />
            </button>
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              onClick={(e) => e.stopPropagation()}
              className={`relative max-w-3xl w-full aspect-video rounded-2xl overflow-hidden bg-gradient-to-br ${lightbox.gradient ?? "from-gray-700 to-gray-900"} flex items-center justify-center`}
            >
              {lightbox.kind === "video" ? (
                <div className="w-20 h-20 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl">
                  <Play size={32} fill="currentColor" className="ml-1" />
                </div>
              ) : (
                <ImageIcon size={64} className="text-white/40" />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, subtle }: { label: string; value: string | number; subtle?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500">{label}</span>
      <span className={`text-sm font-bold ${subtle ? "text-primary" : "text-gray-900"}`}>{value}</span>
    </div>
  );
}

function Composer({ onPost }: { onPost: (body: string, attachments: Attachment[]) => void }) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [focused, setFocused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const GRADIENTS = [
    "from-primary to-sky-700",
    "from-emerald-500 to-emerald-700",
    "from-amber-500 to-orange-600",
    "from-purple-500 to-indigo-700",
    "from-red-500 to-rose-700",
  ];

  const addAttachment = (kind: "image" | "video") => {
    const gradient = GRADIENTS[attachments.length % GRADIENTS.length];
    setAttachments([
      ...attachments,
      kind === "video"
        ? { kind: "video", gradient, duration: "0:42" }
        : { kind: "image", url: "", gradient },
    ]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments(attachments.filter((_, i) => i !== idx));
  };

  const submit = () => {
    if (!body.trim() && attachments.length === 0) return;
    onPost(body.trim(), attachments);
    setBody("");
    setAttachments([]);
    setFocused(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
    >
      <div className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary to-sky-700 text-white flex items-center justify-center text-sm font-bold shrink-0">
            You
          </div>
          <div className="flex-1">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onFocus={() => setFocused(true)}
              placeholder="Share a daily training update with the team…"
              rows={focused || body || attachments.length ? 3 : 1}
              className="w-full bg-gray-50 hover:bg-gray-100 focus:bg-white focus:border-primary border border-transparent rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none transition-colors"
            />

            {attachments.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mt-3">
                {attachments.map((a, i) => (
                  <div
                    key={i}
                    className={`relative aspect-video rounded-lg overflow-hidden bg-gradient-to-br ${a.gradient} flex items-center justify-center`}
                  >
                    {a.kind === "video" ? (
                      <Play size={22} className="text-white" fill="currentColor" />
                    ) : (
                      <ImageIcon size={22} className="text-white/80" />
                    )}
                    <span className="absolute bottom-1 left-1.5 text-[10px] font-semibold text-white/90 uppercase tracking-wide">
                      {a.kind}
                    </span>
                    <button
                      onClick={() => removeAttachment(i)}
                      className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={() => addAttachment("image")} />
          <ToolButton icon={ImageIcon} label="Picture" onClick={() => addAttachment("image")} />
          <ToolButton icon={Video} label="Video" onClick={() => addAttachment("video")} />
          <ToolButton icon={Paperclip} label="File" onClick={() => fileRef.current?.click()} />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-[11px] text-gray-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
            <UsersIcon size={12} />
            Sent to all users
          </div>
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={submit}
            disabled={!body.trim() && attachments.length === 0}
            className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-primary/30"
          >
            <Send size={14} />
            Post update
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

function ToolButton({ icon: Icon, label, onClick }: { icon: any; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-white hover:text-primary transition-colors"
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

function PostCard({
  post,
  index,
  onReact,
  onOpenAttachment,
}: {
  post: UpdatePost;
  index: number;
  onReact: () => void;
  onOpenAttachment: (a: Attachment) => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
    >
      <div className="p-5 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full bg-gradient-to-br ${post.avatarColor} text-white flex items-center justify-center text-sm font-bold`}>
              {post.author.split(" ").map((n) => n[0]).slice(0, 2).join("")}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900 text-sm">{post.author}</span>
                {post.pinned && (
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                    <Pin size={10} /> Pinned
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                <span>{post.authorRole}</span>
                <span>•</span>
                <Calendar size={11} />
                <span>{post.postedAt}</span>
              </div>
            </div>
          </div>
          <button className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
            <MoreVertical size={16} />
          </button>
        </div>

        <p className="text-sm text-gray-700 leading-relaxed mt-3 whitespace-pre-line">
          {post.body}
        </p>

        <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] text-gray-500 bg-gray-50 border border-gray-100 rounded-full px-2.5 py-1">
          <UsersIcon size={12} />
          Sent to {post.audience}
        </div>
      </div>

      {post.attachments.length > 0 && (
        <div className={`px-5 grid gap-2 ${post.attachments.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {post.attachments.map((a, i) => (
            <button
              key={i}
              onClick={() => onOpenAttachment(a)}
              className={`relative aspect-video rounded-xl overflow-hidden bg-gradient-to-br ${a.gradient ?? "from-gray-500 to-gray-700"} group`}
            >
              <div className="absolute inset-0 bg-black/10 group-hover:bg-black/30 transition-colors" />
              {a.kind === "video" ? (
                <>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                      <Play size={22} fill="currentColor" className="ml-1" />
                    </div>
                  </div>
                  {a.duration && (
                    <span className="absolute bottom-2 right-2 text-[11px] font-semibold text-white bg-black/60 px-1.5 py-0.5 rounded">
                      {a.duration}
                    </span>
                  )}
                  <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 px-2 py-0.5 rounded flex items-center gap-1">
                    <Video size={10} /> Video
                  </span>
                </>
              ) : (
                <>
                  <ImageIcon size={40} className="absolute inset-0 m-auto text-white/40" />
                  <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 px-2 py-0.5 rounded flex items-center gap-1">
                    <ImageIcon size={10} /> Picture
                  </span>
                </>
              )}
            </button>
          ))}
        </div>
      )}

      <div className="px-5 py-3 mt-3 border-t border-gray-100 flex items-center gap-1">
        <button
          onClick={onReact}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${post.reacted ? "text-rose-600 bg-rose-50" : "text-gray-600 hover:bg-gray-50"}`}
        >
          <Heart size={14} fill={post.reacted ? "currentColor" : "none"} />
          {post.reactions}
        </button>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors">
          <MessageSquare size={14} />
          {post.comments}
        </button>
      </div>
    </motion.div>
  );
}

/* -------------------------- Photo Gallery -------------------------- */

interface PhotoItem {
  id: number;
  title: string;
  album: string;
  uploadedBy: string;
  uploadedAt: string;
  gradient: string;
  size?: string;
}

const SEED_PHOTOS: PhotoItem[] = [
  { id: 1, title: "Anchor-point setup — Tower B", album: "Safety", uploadedBy: "Sara Al-Mutairi", uploadedAt: "Today", gradient: "from-red-500 to-rose-700" },
  { id: 2, title: "Foundation rebar layout", album: "Inspections", uploadedBy: "Khalid Rahman", uploadedAt: "Today", gradient: "from-amber-400 to-orange-600" },
  { id: 3, title: "Slab moisture-meter readings", album: "Inspections", uploadedBy: "Khalid Rahman", uploadedAt: "Yesterday", gradient: "from-primary to-sky-700" },
  { id: 4, title: "Roof flashing detail", album: "Inspections", uploadedBy: "Omar Hassan", uploadedAt: "Yesterday", gradient: "from-emerald-500 to-emerald-700" },
  { id: 5, title: "Approved harness — Petzl Avao", album: "Safety", uploadedBy: "Sara Al-Mutairi", uploadedAt: "2 days ago", gradient: "from-purple-500 to-indigo-700" },
  { id: 6, title: "Crack mapping — wall section 4", album: "Inspections", uploadedBy: "Layla Karim", uploadedAt: "2 days ago", gradient: "from-cyan-500 to-blue-700" },
  { id: 7, title: "Updated drawing template — sheet A1", album: "Designs", uploadedBy: "Omar Hassan", uploadedAt: "3 days ago", gradient: "from-pink-500 to-rose-600" },
  { id: 8, title: "Steel column connection — typical", album: "Designs", uploadedBy: "Khalid Rahman", uploadedAt: "3 days ago", gradient: "from-slate-600 to-slate-800" },
  { id: 9, title: "Site safety briefing — morning shift", album: "Safety", uploadedBy: "Sara Al-Mutairi", uploadedAt: "4 days ago", gradient: "from-teal-500 to-emerald-700" },
  { id: 10, title: "Concrete pour preparation", album: "Inspections", uploadedBy: "Layla Karim", uploadedAt: "5 days ago", gradient: "from-yellow-500 to-amber-700" },
  { id: 11, title: "Reinforcement spacing check", album: "Inspections", uploadedBy: "Khalid Rahman", uploadedAt: "5 days ago", gradient: "from-fuchsia-500 to-purple-700" },
  { id: 12, title: "Approved PPE checklist board", album: "Safety", uploadedBy: "Sara Al-Mutairi", uploadedAt: "1 week ago", gradient: "from-orange-500 to-red-700" },
];

const PHOTO_ALBUMS = ["All", "Inspections", "Safety", "Designs"];

function PhotoGallery({ canPost }: { canPost: boolean }) {
  const [album, setAlbum] = useState("All");
  const [search, setSearch] = useState("");
  const [lightbox, setLightbox] = useState<PhotoItem | null>(null);

  const filtered = SEED_PHOTOS.filter(
    (p) =>
      (album === "All" || p.album === album) &&
      p.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <GalleryToolbar
        search={search}
        setSearch={setSearch}
        filter={album}
        setFilter={setAlbum}
        options={PHOTO_ALBUMS}
        layoutId="photoFilter"
        placeholder="Search photos…"
        canPost={canPost}
        uploadLabel="Upload photos"
        uploadIcon={ImageIcon}
        accept="image/*"
        multiple
      />

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">No photos match your filters.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {filtered.map((p, i) => (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              whileHover={{ y: -3 }}
              onClick={() => setLightbox(p)}
              className={`group relative aspect-square rounded-xl overflow-hidden bg-gradient-to-br ${p.gradient} shadow-sm hover:shadow-xl transition-shadow text-left`}
            >
              <ImageIcon size={36} className="absolute inset-0 m-auto text-white/30" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-xs font-bold truncate">{p.title}</div>
                <div className="text-[10px] text-white/80 truncate">{p.uploadedBy} · {p.uploadedAt}</div>
              </div>
              <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider text-white bg-black/40 px-1.5 py-0.5 rounded">
                {p.album}
              </span>
              <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/95 text-primary flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Eye size={13} />
              </div>
            </motion.button>
          ))}
        </div>
      )}

      <AnimatePresence>
        {lightbox && <PhotoLightbox photo={lightbox} onClose={() => setLightbox(null)} />}
      </AnimatePresence>
    </>
  );
}

function PhotoLightbox({ photo, onClose }: { photo: PhotoItem; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"
    >
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
        <X size={20} />
      </button>
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl w-full"
      >
        <div className={`relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br ${photo.gradient} flex items-center justify-center`}>
          <ImageIcon size={72} className="text-white/30" />
        </div>
        <div className="mt-4 flex items-start justify-between gap-4 text-white">
          <div>
            <div className="text-lg font-bold">{photo.title}</div>
            <div className="text-xs text-white/70 mt-1">{photo.album} · uploaded by {photo.uploadedBy} · {photo.uploadedAt}</div>
          </div>
          <button className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-xs font-semibold">
            <Download size={14} /> Download
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------- Video Library -------------------------- */

interface VideoItem {
  id: number;
  title: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  duration: string;
  views: number;
  gradient: string;
  description?: string;
}

const SEED_VIDEOS: VideoItem[] = [
  { id: 1, title: "Updated drawing review workflow", category: "Designs", uploadedBy: "Omar Hassan", uploadedAt: "Today", duration: "5:46", views: 42, gradient: "from-purple-600 to-indigo-800", description: "Walkthrough of the new structural drawing review process used during Thursday's design review." },
  { id: 2, title: "Roof inspection — moisture meter walkthrough", category: "Inspections", uploadedBy: "Khalid Rahman", uploadedAt: "Today", duration: "2:14", views: 87, gradient: "from-primary to-sky-800", description: "How to capture moisture-meter readings on all four slab quadrants and log them in the report template." },
  { id: 3, title: "Harness inspection & anchor-point safety", category: "Safety", uploadedBy: "Sara Al-Mutairi", uploadedAt: "Yesterday", duration: "4:08", views: 134, gradient: "from-red-500 to-rose-700" },
  { id: 4, title: "Tablet field-app — daily usage tips", category: "Onboarding", uploadedBy: "Layla Karim", uploadedAt: "2 days ago", duration: "8:22", views: 56, gradient: "from-emerald-500 to-emerald-700" },
  { id: 5, title: "Reinforcement layout — common mistakes", category: "Inspections", uploadedBy: "Khalid Rahman", uploadedAt: "3 days ago", duration: "6:31", views: 71, gradient: "from-amber-500 to-orange-600" },
  { id: 6, title: "Time-tracking & billable-hours guide", category: "Onboarding", uploadedBy: "Sara Al-Mutairi", uploadedAt: "5 days ago", duration: "3:50", views: 98, gradient: "from-cyan-500 to-blue-700" },
  { id: 7, title: "Steel connection details — typical", category: "Designs", uploadedBy: "Omar Hassan", uploadedAt: "1 week ago", duration: "7:12", views: 64, gradient: "from-slate-600 to-slate-800" },
  { id: 8, title: "Pre-pour concrete checklist", category: "Inspections", uploadedBy: "Layla Karim", uploadedAt: "1 week ago", duration: "4:45", views: 80, gradient: "from-teal-500 to-emerald-700" },
];

const VIDEO_CATEGORIES = ["All", "Onboarding", "Inspections", "Designs", "Safety"];

function VideoLibrary({ canPost }: { canPost: boolean }) {
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [player, setPlayer] = useState<VideoItem | null>(null);

  const filtered = SEED_VIDEOS.filter(
    (v) =>
      (cat === "All" || v.category === cat) &&
      v.title.toLowerCase().includes(search.toLowerCase())
  );

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <>
      <GalleryToolbar
        search={search}
        setSearch={setSearch}
        filter={cat}
        setFilter={setCat}
        options={VIDEO_CATEGORIES}
        layoutId="videoFilter"
        placeholder="Search videos…"
        canPost={canPost}
        uploadLabel="Upload video"
        uploadIcon={Video}
        accept="video/*"
      />

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">No videos match your filters.</div>
      ) : (
        <>
          {/* Featured */}
          {featured && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setPlayer(featured)}
              className={`group relative w-full aspect-[16/7] rounded-2xl overflow-hidden bg-gradient-to-br ${featured.gradient} mb-5 text-left shadow-sm hover:shadow-xl transition-shadow`}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                  <Play size={32} fill="currentColor" className="ml-1" />
                </div>
              </div>
              <span className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-wider text-white bg-primary px-2 py-1 rounded">
                Featured
              </span>
              <span className="absolute top-4 right-4 text-xs font-semibold text-white bg-black/60 px-2 py-1 rounded">
                {featured.duration}
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/80 mb-1">{featured.category}</div>
                <div className="text-xl font-bold mb-1">{featured.title}</div>
                <div className="text-xs text-white/80">{featured.uploadedBy} · {featured.uploadedAt} · {featured.views} views</div>
              </div>
            </motion.button>
          )}

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rest.map((v, i) => (
              <motion.button
                key={v.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                whileHover={{ y: -4 }}
                onClick={() => setPlayer(v)}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden text-left hover:shadow-xl transition-shadow"
              >
                <div className={`relative aspect-video bg-gradient-to-br ${v.gradient} group`}>
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                      <Play size={22} fill="currentColor" className="ml-1" />
                    </div>
                  </div>
                  <span className="absolute bottom-2 right-2 text-[11px] font-semibold text-white bg-black/70 px-1.5 py-0.5 rounded">
                    {v.duration}
                  </span>
                  <span className="absolute top-2 left-2 text-[10px] font-bold uppercase tracking-wider text-white bg-black/40 px-2 py-0.5 rounded">
                    {v.category}
                  </span>
                </div>
                <div className="p-4">
                  <div className="font-bold text-gray-900 text-sm leading-snug line-clamp-2 mb-2">{v.title}</div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500">
                    <span>{v.uploadedBy}</span>
                    <span>•</span>
                    <span>{v.uploadedAt}</span>
                    <span>•</span>
                    <span>{v.views} views</span>
                  </div>
                </div>
              </motion.button>
            ))}
          </div>
        </>
      )}

      <AnimatePresence>
        {player && <VideoPlayer video={player} onClose={() => setPlayer(null)} />}
      </AnimatePresence>
    </>
  );
}

function VideoPlayer({ video, onClose }: { video: VideoItem; onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-6"
    >
      <button onClick={onClose} className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center">
        <X size={20} />
      </button>
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl w-full"
      >
        <div className={`relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br ${video.gradient} flex items-center justify-center`}>
          <div className="w-24 h-24 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl">
            <Play size={36} fill="currentColor" className="ml-1" />
          </div>
          <span className="absolute bottom-3 right-3 text-xs font-semibold text-white bg-black/70 px-2 py-1 rounded">
            {video.duration}
          </span>
        </div>
        <div className="mt-4 text-white">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70 mb-1">{video.category}</div>
          <div className="text-xl font-bold">{video.title}</div>
          <div className="text-xs text-white/70 mt-1">{video.uploadedBy} · {video.uploadedAt} · {video.views} views</div>
          {video.description && (
            <p className="text-sm text-white/85 mt-3 leading-relaxed">{video.description}</p>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------- Shared gallery toolbar -------------------------- */

function GalleryToolbar({
  search, setSearch, filter, setFilter, options, layoutId, placeholder,
  canPost, uploadLabel, uploadIcon: UploadIcon, accept, multiple,
}: {
  search: string;
  setSearch: (s: string) => void;
  filter: string;
  setFilter: (s: string) => void;
  options: string[];
  layoutId: string;
  placeholder: string;
  canPost: boolean;
  uploadLabel: string;
  uploadIcon: any;
  accept: string;
  multiple?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-5">
      <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md flex-1 focus-within:border-primary transition-colors">
        <Search size={16} className="text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} className="bg-transparent text-sm flex-1 focus:outline-none" />
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {options.map((c) => (
            <motion.button key={c} whileTap={{ scale: 0.96 }} onClick={() => setFilter(c)} className={`relative px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${filter === c ? "text-white" : "text-gray-600 hover:text-gray-900"}`}>
              {filter === c && <motion.div layoutId={layoutId} className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              <span className="relative">{c}</span>
            </motion.button>
          ))}
        </div>
        {canPost && (
          <>
            <input ref={fileRef} type="file" accept={accept} multiple={multiple} className="hidden" />
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => fileRef.current?.click()}
              className="bg-primary text-white px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-primary/30"
            >
              <UploadIcon size={14} />
              {uploadLabel}
            </motion.button>
          </>
        )}
      </div>
    </div>
  );
}

/* -------------------------- Courses view -------------------------- */

function CoursesView() {
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  const filtered = COURSES.filter((c) =>
    (filter === "All" || c.category === filter) &&
    c.title.toLowerCase().includes(search.toLowerCase())
  );

  const completed = COURSES.filter((c) => c.progress === 100).length;
  const inProgress = COURSES.filter((c) => c.progress > 0 && c.progress < 100).length;
  const totalHours = COURSES.reduce((acc, c) => {
    const [h, m] = c.duration.split(" ");
    return acc + parseInt(h) + parseInt(m) / 60;
  }, 0);

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Courses Completed", value: completed, total: COURSES.length, icon: CheckCircle2, color: "from-emerald-500 to-emerald-700", bg: "bg-emerald-50", text: "text-emerald-600" },
          { label: "In Progress", value: inProgress, icon: BookOpen, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
          { label: "Learning Hours", value: totalHours.toFixed(1), icon: Clock, color: "from-amber-500 to-orange-600", bg: "bg-amber-50", text: "text-amber-600" },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
              whileHover={{ y: -3, boxShadow: "0 12px 24px rgba(0,0,0,0.06)" }}
              className="relative bg-white rounded-2xl p-5 border border-gray-100 overflow-hidden"
            >
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full bg-gradient-to-br ${s.color} opacity-5 blur-2xl`} />
              <div className="relative z-10 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wider">{s.label}</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {s.value}{s.total ? <span className="text-sm font-medium text-gray-400">/{s.total}</span> : ""}
                  </div>
                </div>
                <div className={`w-11 h-11 rounded-xl ${s.bg} ${s.text} flex items-center justify-center`}>
                  <Icon size={20} />
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between mb-6">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2.5 max-w-md flex-1 focus-within:border-primary transition-colors">
          <Search size={16} className="text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses…" className="bg-transparent text-sm flex-1 focus:outline-none" />
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl overflow-x-auto">
          {CATEGORIES.map((c) => (
            <motion.button key={c} whileTap={{ scale: 0.96 }} onClick={() => setFilter(c)} className={`relative px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${filter === c ? "text-white" : "text-gray-600 hover:text-gray-900"}`}>
              {filter === c && <motion.div layoutId="trainingFilter" className="absolute inset-0 bg-primary rounded-lg pointer-events-none" transition={{ type: "spring", stiffness: 300, damping: 25 }} />}
              <span className="relative">{c}</span>
            </motion.button>
          ))}
        </div>
      </motion.div>

      <CourseGrid filtered={filtered} />
    </>
  );
}

function CourseGrid({ filtered }: { filtered: typeof COURSES }) {
  const { page, setPage, totalPages, pageItems, total, pageSize } = usePagination(filtered, 6);
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {pageItems.map((c, i) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            whileHover={{ y: -6 }}
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden cursor-pointer group hover:shadow-xl transition-shadow"
          >
            {/* Thumbnail */}
            <div className={`relative h-36 bg-gradient-to-br ${c.thumb} overflow-hidden`}>
              <motion.div
                className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileHover={{ scale: 1 }}
                  animate={{ scale: 1 }}
                  className="w-14 h-14 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl"
                >
                  <Play size={22} fill="currentColor" className="ml-1" />
                </motion.div>
              </motion.div>
              <div className="absolute top-3 left-3 flex gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded ${LEVEL_COLOR[c.level]}`}>{c.level}</span>
              </div>
              {c.progress === 100 && (
                <motion.div
                  initial={{ scale: 0, rotate: -45 }}
                  animate={{ scale: 1, rotate: 0 }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-lg"
                >
                  <CheckCircle2 size={16} />
                </motion.div>
              )}
              <GraduationCap className="absolute -bottom-3 -right-3 text-white/20" size={80} />
            </div>

            {/* Body */}
            <div className="p-5">
              <div className="text-xs font-medium text-gray-500 mb-1">{c.category}</div>
              <h3 className="font-bold text-gray-900 mb-3 line-clamp-2">{c.title}</h3>
              <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                <div className="flex items-center gap-1"><BookOpen size={11} /> {c.lessons} lessons</div>
                <div className="flex items-center gap-1"><Clock size={11} /> {c.duration}</div>
              </div>

              {/* Progress */}
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-gray-500">Progress</span>
                <span className="font-bold text-gray-900">{c.progress}%</span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${c.progress}%` }}
                  transition={{ duration: 0.8, delay: 0.2 + i * 0.04, ease: "easeOut" }}
                  className={`h-full rounded-full ${c.progress === 100 ? "bg-emerald-500" : "bg-primary"}`}
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className={`mt-4 w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${c.progress === 100 ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : c.progress > 0 ? "bg-primary text-white hover:bg-primary/90 shadow-md shadow-primary/30" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
              >
                {c.progress === 100 ? <span className="flex items-center justify-center gap-1.5"><Award size={14} /> View Certificate</span> : c.progress > 0 ? "Continue Learning" : "Start Course"}
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400">No courses match your search.</div>
      )}
      {filtered.length > 0 && (
        <div className="mt-4 bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <Pagination page={page} totalPages={totalPages} total={total} pageSize={pageSize} onChange={setPage} label="courses" />
        </div>
      )}
    </>
  );
}
