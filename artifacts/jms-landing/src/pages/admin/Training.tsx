import { useMemo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, BookOpen, Award, Clock, CheckCircle2,
  Search, GraduationCap, Megaphone, Image as ImageIcon, Video, Send,
  Users as UsersIcon, X, Pin, MoreVertical, Heart, MessageSquare,
  Paperclip, Calendar, Images, Film, Download, Eye,
  Trash2,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import type { Role } from "@/lib/roles";
import { useGetPosts, useCreatePost, getGetPostsQueryKey, type Post } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const CATEGORIES = ["All", "Onboarding", "Safety", "Technical", "Leadership"];

type Attachment =
  | { id?: string; kind: "image"; url: string; fileName: string }
  | { id?: string; kind: "video"; url: string; fileName: string }
  | { id?: string; kind: "file"; url: string; fileName: string };

type DraftAttachment = {
  id: string;
  kind: Attachment["kind"];
  file: File;
  previewUrl?: string;
};

interface UpdatePost {
  id: string;
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

function roleLabel(role: string | undefined) {
  if (!role) return "User";
  if (role === "super-admin") return "Super Admin";
  if (role === "admin") return "Admin";
  if (role === "supervisor") return "Supervisor";
  return "User";
}

function parsePostAttachments(post: Post): Attachment[] {
  try {
    const raw = (post as any)?.attachments;
    if (!raw) return [];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((a: any) => {
        const id = typeof a?.id === "string" ? a.id : undefined;
        const kind = a?.kind as Attachment["kind"] | undefined;
        const url = typeof a?.url === "string" ? a.url : "";
        const fileName = typeof a?.fileName === "string" ? a.fileName : "file";
        if (!kind || !url) return null;
        if (kind !== "image" && kind !== "video" && kind !== "file") return null;
        return { id, kind, url, fileName } satisfies Attachment;
      })
      .filter(Boolean) as Attachment[];
  } catch {
    return [];
  }
}

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
  const { data: apiPosts, isLoading } = useGetPosts();
  const createPostMutation = useCreatePost();
  const qc = useQueryClient();
  const [lightbox, setLightbox] = useState<Attachment | null>(null);
  const [metaByPostId, setMetaByPostId] = useState<Record<string, { liked: boolean; likeCount: number; commentCount: number }>>({});
  const [likesModal, setLikesModal] = useState<{ postId: string; title: string } | null>(null);
  const [likesUsers, setLikesUsers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [likesLoading, setLikesLoading] = useState(false);
  const [commentsModal, setCommentsModal] = useState<{ postId: string; title: string } | null>(null);
  const [comments, setComments] = useState<Array<{ id: string; body: string; createdAt: string; author: { id: string; name: string; role: string } }>>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState("");

  const handlePost = async (body: string, attachments: DraftAttachment[]) => {
    try {
      const safeBody = body.trim();
      const created = await createPostMutation.mutateAsync({
        data: {
          title: safeBody ? safeBody.slice(0, 50) : "Training update",
          body: safeBody || "",
          category: "Technical", // Default category
        }
      });

      for (const a of attachments) {
        const fd = new FormData();
        fd.append("file", a.file);
        const res = await fetch(`/api/posts/${created.id}/attachments`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error(await res.text());
        }
      }

      await qc.invalidateQueries({ queryKey: getGetPostsQueryKey() });
    } catch (err) {
      console.error("Failed to create post:", err);
    }
  };

  useEffect(() => {
    const next: Record<string, { liked: boolean; likeCount: number; commentCount: number }> = {};
    for (const p of apiPosts ?? []) {
      const liked = Boolean((p as any)?.likedByMe);
      const likeCount = Number((p as any)?.likeCount ?? 0);
      const commentCount = Number((p as any)?.commentCount ?? 0);
      next[p.id] = { liked, likeCount, commentCount };
    }
    setMetaByPostId(next);
  }, [apiPosts]);

  const refreshLikes = async (postId: string) => {
    setLikesLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/likes`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLikesUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load likes:", err);
      setLikesUsers([]);
    } finally {
      setLikesLoading(false);
    }
  };

  const refreshComments = async (postId: string) => {
    setCommentsLoading(true);
    try {
      const res = await fetch(`/api/posts/${postId}/comments`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setComments(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Failed to load comments:", err);
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  };

  const toggleLike = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/likes`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const liked = Boolean((data as any)?.liked);
      const likeCount = Number((data as any)?.likeCount ?? 0);
      setMetaByPostId((prev) => ({
        ...prev,
        [postId]: {
          liked,
          likeCount,
          commentCount: prev[postId]?.commentCount ?? 0,
        },
      }));
      if (likesModal?.postId === postId) {
        void refreshLikes(postId);
      }
    } catch (err) {
      console.error("Failed to toggle like:", err);
    }
  };

  const openLikes = (postId: string, title: string) => {
    setLikesModal({ postId, title });
    setLikesUsers([]);
    void refreshLikes(postId);
  };

  const openComments = (postId: string, title: string) => {
    setCommentsModal({ postId, title });
    setNewComment("");
    setComments([]);
    void refreshComments(postId);
  };

  const addComment = async (postId: string) => {
    try {
      const body = newComment.trim();
      if (!body) return;
      const res = await fetch(`/api/posts/${postId}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error(await res.text());
      const created = await res.json();
      setComments((prev) => [...prev, created]);
      setNewComment("");
      setMetaByPostId((prev) => ({
        ...prev,
        [postId]: {
          liked: prev[postId]?.liked ?? false,
          likeCount: prev[postId]?.likeCount ?? 0,
          commentCount: (prev[postId]?.commentCount ?? 0) + 1,
        },
      }));
      setCommentsModal(null);
    } catch (err) {
      console.error("Failed to add comment:", err);
    }
  };

  const handleDelete = async (postId: string) => {
    try {
      const ok = window.confirm("Delete this post? This will also remove its uploaded files.");
      if (!ok) return;
      let res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.status === 404) {
        res = await fetch(`/api/posts/${postId}/delete`, {
          method: "POST",
          credentials: "include",
        });
      }
      if (!res.ok && res.status !== 204) {
        throw new Error(await res.text());
      }
      await qc.invalidateQueries({ queryKey: getGetPostsQueryKey() });
    } catch (err) {
      console.error("Failed to delete post:", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  const sorted = [...(apiPosts ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Feed */}
      <div className="lg:col-span-2 space-y-5">
        {canPost && <Composer onPost={handlePost} />}

        {sorted.map((post, i) => {
          const author = (post as any)?.author;
          const attachments = parsePostAttachments(post);
          const authorName = typeof author?.name === "string" && author.name.trim() ? author.name : "—";
          const authorRole = roleLabel(author?.role);
          const meta = metaByPostId[post.id] ?? { liked: false, likeCount: 0, commentCount: 0 };
          return (
            <PostCard
              key={post.id}
              post={{
                id: post.id,
                author: authorName,
                authorRole,
                avatarColor: "from-primary to-sky-700",
                body: post.body,
                attachments,
                postedAt: new Date(post.createdAt).toLocaleString(),
                audience: "All users",
                reactions: meta.likeCount,
                comments: meta.commentCount,
                reacted: meta.liked,
              } as any}
              index={i}
              onToggleLike={() => void toggleLike(post.id)}
              onOpenLikes={() => openLikes(post.id, post.title || "Post")}
              onOpenComments={() => openComments(post.id, post.title || "Post")}
              onOpenAttachment={(a) => setLightbox(a)}
              canDelete={canPost}
              onDelete={() => void handleDelete(post.id)}
            />
          );
        })}
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
          <Stat label="Updates posted" value={apiPosts?.length ?? 0} />
          <Stat label="Reactions" value={0} />
          <Stat label="Comments" value={0} />
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
              className="relative max-w-3xl w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center"
            >
              {lightbox.kind === "image" && (
                <img src={lightbox.url} alt={lightbox.fileName} className="max-h-[80vh] w-auto object-contain" />
              )}
              {lightbox.kind === "video" && (
                <video src={lightbox.url} controls autoPlay className="max-h-[80vh] w-auto" />
              )}
              {lightbox.kind === "file" && (
                <div className="p-8 text-center text-white">
                  <div className="text-sm font-semibold">{lightbox.fileName}</div>
                  <button
                    onClick={() => window.open(lightbox.url, "_blank", "noopener,noreferrer")}
                    className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-gray-900 text-sm font-semibold"
                  >
                    <Download size={16} /> Download
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {likesModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setLikesModal(null);
            }}
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-white rounded-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="text-sm font-bold text-gray-900">Likes</div>
                <button onClick={() => setLikesModal(null)} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4">
                <div className="text-xs text-gray-500 line-clamp-1">{likesModal.title}</div>
                {likesLoading ? (
                  <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
                ) : likesUsers.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">No likes yet.</div>
                ) : (
                  <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden mt-3">
                    {likesUsers.map((u) => (
                      <div key={u.id} className="p-3 flex items-center justify-between bg-white">
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-gray-900 truncate">{u.name}</div>
                          <div className="text-[11px] text-gray-500">{roleLabel(u.role)}</div>
                        </div>
                        <Heart size={16} className="text-rose-600" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {commentsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setCommentsModal(null);
            }}
            className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.95, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-white rounded-2xl overflow-hidden"
            >
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <div className="text-sm font-bold text-gray-900">Comments</div>
                <button onClick={() => setCommentsModal(null)} className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100">
                  <X size={16} />
                </button>
              </div>
              <div className="p-4">
                <div className="text-xs text-gray-500 line-clamp-1">{commentsModal.title}</div>
                {commentsLoading ? (
                  <div className="py-10 text-center text-sm text-gray-400">Loading…</div>
                ) : comments.length === 0 ? (
                  <div className="py-10 text-center text-sm text-gray-400">No comments yet.</div>
                ) : (
                  <div className="mt-3 space-y-3 max-h-[50vh] overflow-auto pr-1">
                    {comments.map((c) => (
                      <div key={c.id} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold text-gray-900">{c.author.name}</div>
                          <div className="text-[10px] text-gray-500">{new Date(c.createdAt).toLocaleString()}</div>
                        </div>
                        <div className="text-sm text-gray-700 mt-2 whitespace-pre-line">{c.body}</div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="mt-4 flex items-end gap-2">
                  <textarea
                    value={newComment}
                    onChange={(e) => setNewComment(e.target.value)}
                    placeholder="Write a comment…"
                    rows={2}
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-primary"
                  />
                  <button
                    onClick={() => void addComment(commentsModal.postId)}
                    disabled={!newComment.trim()}
                    className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Post
                  </button>
                </div>
              </div>
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

function Composer({ onPost }: { onPost: (body: string, attachments: DraftAttachment[]) => void }) {
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<DraftAttachment[]>([]);
  const [focused, setFocused] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingKindRef = useRef<DraftAttachment["kind"]>("image");
  const attachmentsRef = useRef<DraftAttachment[]>([]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) {
        if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
      }
    };
  }, []);

  const addFiles = (kind: DraftAttachment["kind"], files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next: DraftAttachment[] = [];
    for (const file of Array.from(files)) {
      const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      const previewUrl =
        kind === "image" || kind === "video" ? URL.createObjectURL(file) : undefined;
      next.push({ id, kind, file, previewUrl });
    }
    setAttachments((prev) => [...prev, ...next].slice(0, 10));
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const target = prev[idx];
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  };

  const submit = () => {
    if (!body.trim() && attachments.length === 0) return;
    onPost(body.trim(), attachments);
    for (const a of attachments) {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    }
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
                    className="relative aspect-video rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center"
                  >
                    {a.kind === "image" && a.previewUrl && (
                      <img src={a.previewUrl} alt={a.file.name} className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    {a.kind === "video" && a.previewUrl && (
                      <video src={a.previewUrl} muted playsInline className="absolute inset-0 w-full h-full object-cover" />
                    )}
                    {a.kind === "file" && (
                      <Paperclip size={22} className="text-gray-500" />
                    )}
                    {(a.kind === "video" || a.kind === "image") && (
                      <div className="absolute inset-0 bg-black/25" />
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
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            multiple
            onChange={(e) => {
              addFiles(pendingKindRef.current, e.target.files);
              e.currentTarget.value = "";
            }}
          />
          <ToolButton
            icon={ImageIcon}
            label="Picture"
            onClick={() => {
              pendingKindRef.current = "image";
              if (fileRef.current) fileRef.current.accept = "image/*";
              fileRef.current?.click();
            }}
          />
          <ToolButton
            icon={Video}
            label="Video"
            onClick={() => {
              pendingKindRef.current = "video";
              if (fileRef.current) fileRef.current.accept = "video/*";
              fileRef.current?.click();
            }}
          />
          <ToolButton
            icon={Paperclip}
            label="File"
            onClick={() => {
              pendingKindRef.current = "file";
              if (fileRef.current) fileRef.current.accept = "*/*";
              fileRef.current?.click();
            }}
          />
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
  onToggleLike,
  onOpenLikes,
  onOpenComments,
  onOpenAttachment,
  canDelete,
  onDelete,
}: {
  post: UpdatePost;
  index: number;
  onToggleLike: () => void;
  onOpenLikes: () => void;
  onOpenComments: () => void;
  onOpenAttachment: (a: Attachment) => void;
  canDelete?: boolean;
  onDelete?: () => void;
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
          <div className="flex items-center gap-2">
            {canDelete && onDelete && (
              <button
                onClick={onDelete}
                className="text-gray-400 hover:text-rose-600 p-1 rounded-lg hover:bg-gray-100"
                aria-label="Delete post"
              >
                <Trash2 size={16} />
              </button>
            )}
            <button className="text-gray-400 hover:text-gray-700 p-1 rounded-lg hover:bg-gray-100" aria-label="More">
              <MoreVertical size={16} />
            </button>
          </div>
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
        <div className="px-5">
          <AttachmentCarousel attachments={post.attachments} onOpen={onOpenAttachment} />
        </div>
      )}

      <div className="px-5 py-3 mt-3 border-t border-gray-100 flex items-center gap-1">
        <button
          onClick={onToggleLike}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${post.reacted ? "text-rose-600 bg-rose-50" : "text-gray-600 hover:bg-gray-50"}`}
        >
          <Heart size={14} fill={post.reacted ? "currentColor" : "none"} />
          Like
        </button>
        <button
          onClick={onOpenLikes}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <UsersIcon size={14} />
          {post.reactions}
        </button>
        <button
          onClick={onOpenComments}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <MessageSquare size={14} />
          {post.comments}
        </button>
      </div>
    </motion.div>
  );
}

/* -------------------------- Attachment Carousel -------------------------- */

function AttachmentCarousel({
  attachments,
  onOpen,
}: {
  attachments: Attachment[];
  onOpen: (a: Attachment) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = attachments.length;
  const single = count === 1;

  useEffect(() => {
    const el = trackRef.current;
    if (!el || single) return;
    const onScroll = () => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      setActive(Math.max(0, Math.min(count - 1, idx)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [count, single]);

  const goTo = (idx: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="relative group/carousel">
      <div
        ref={trackRef}
        className={
          single
            ? ""
            : "flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden rounded-xl"
        }
      >
        {attachments.map((a, i) => (
          <button
            key={a.id ?? `${a.kind}:${a.url}:${i}`}
            onClick={() => onOpen(a)}
            className={`relative aspect-video bg-gray-100 group ${
              single ? "w-full rounded-xl overflow-hidden" : "snap-center shrink-0 w-full overflow-hidden"
            }`}
          >
            {a.kind === "image" && (
              <img src={a.url} alt={a.fileName} className="absolute inset-0 w-full h-full object-cover" />
            )}
            {a.kind === "video" && (
              <div className="absolute inset-0 bg-black">
                <video src={a.url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                    <Play size={26} fill="currentColor" className="ml-1" />
                  </div>
                </div>
              </div>
            )}
            {a.kind === "file" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-700">
                <Paperclip size={22} className="text-gray-500" />
                <div className="px-4 text-xs font-semibold text-gray-700 line-clamp-2">{a.fileName}</div>
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
          </button>
        ))}
      </div>

      {!single && (
        <>
          {/* Counter pill — top-right, Instagram-style */}
          <div className="absolute top-3 right-3 text-[11px] font-semibold text-white bg-black/55 backdrop-blur-sm px-2 py-0.5 rounded-full pointer-events-none">
            {active + 1} / {count}
          </div>

          {/* Prev arrow */}
          {active > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); goTo(active - 1); }}
              aria-label="Previous"
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 text-gray-800 flex items-center justify-center shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity hover:scale-105"
            >
              <ChevronLeft size={18} />
            </button>
          )}

          {/* Next arrow */}
          {active < count - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); goTo(active + 1); }}
              aria-label="Next"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 text-gray-800 flex items-center justify-center shadow-lg opacity-0 group-hover/carousel:opacity-100 transition-opacity hover:scale-105"
            >
              <ChevronRight size={18} />
            </button>
          )}

          {/* Dot indicators */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            {attachments.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={`h-1.5 rounded-full transition-all ${i === active ? "w-5 bg-primary" : "w-1.5 bg-gray-300 hover:bg-gray-400"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------- Photo Gallery -------------------------- */

interface PhotoItem {
  id: string;
  title: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
}

function PhotoGallery({ canPost }: { canPost: boolean }) {
  const { data: apiPosts, isLoading } = useGetPosts();
  const createPostMutation = useCreatePost();
  const qc = useQueryClient();
  const [album, setAlbum] = useState("All");
  const [search, setSearch] = useState("");
  const [lightbox, setLightbox] = useState<PhotoItem | null>(null);

  const photos = useMemo(() => {
    const out: PhotoItem[] = [];
    for (const post of apiPosts ?? []) {
      const author = (post as any)?.author;
      const authorName = typeof author?.name === "string" ? author.name : "—";
      const attachments = parsePostAttachments(post).filter((a) => a.kind === "image");
      for (const a of attachments) {
        out.push({
          id: a.id ?? `${post.id}:${a.url}`,
          title: post.title || a.fileName || "Photo",
          category: post.category || "Other",
          uploadedBy: authorName,
          uploadedAt: new Date(post.createdAt).toLocaleString(),
          url: a.url,
        });
      }
    }
    return out;
  }, [apiPosts]);

  const albums = useMemo(() => {
    const set = new Set<string>();
    for (const p of photos) set.add(p.category || "Other");
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [photos]);

  const filtered = useMemo(() => {
    return photos.filter((p) => {
      if (album !== "All" && p.category !== album) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.uploadedBy.toLowerCase().includes(q);
    });
  }, [photos, album, search]);

  const uploadPhotos = async (files: FileList | null) => {
    try {
      if (!files || files.length === 0) return;
      const first = files.item(0);
      const title = first?.name ? first.name.slice(0, 80) : "Photo upload";
      const category = album !== "All" ? album : "Technical";
      const created = await createPostMutation.mutateAsync({
        data: { title, body: "", category },
      });
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        const res = await fetch(`/api/posts/${created.id}/attachments`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
      }
      await qc.invalidateQueries({ queryKey: getGetPostsQueryKey() });
    } catch (err) {
      console.error("Failed to upload photos:", err);
    }
  };

  return (
    <>
      <GalleryToolbar
        search={search}
        setSearch={setSearch}
        filter={album}
        setFilter={setAlbum}
        options={albums}
        layoutId="photoFilter"
        placeholder="Search photos…"
        canPost={canPost}
        uploadLabel="Upload photos"
        uploadIcon={ImageIcon}
        accept="image/*"
        multiple
        onUploadFiles={uploadPhotos}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filtered.length === 0 ? (
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
              className="group relative aspect-square rounded-xl overflow-hidden bg-gray-100 shadow-sm hover:shadow-xl transition-shadow text-left"
            >
              <img src={p.url} alt={p.title} className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-0 left-0 right-0 p-2.5 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="text-xs font-bold truncate">{p.title}</div>
                <div className="text-[10px] text-white/80 truncate">{p.uploadedBy} · {p.uploadedAt}</div>
              </div>
              <span className="absolute top-2 left-2 text-[9px] font-bold uppercase tracking-wider text-white bg-black/40 px-1.5 py-0.5 rounded">
                {p.category}
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
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-black flex items-center justify-center">
          <img src={photo.url} alt={photo.title} className="w-full h-full object-contain" />
        </div>
        <div className="mt-4 flex items-start justify-between gap-4 text-white">
          <div>
            <div className="text-lg font-bold">{photo.title}</div>
            <div className="text-xs text-white/70 mt-1">{photo.category} · uploaded by {photo.uploadedBy} · {photo.uploadedAt}</div>
          </div>
          <button
            onClick={() => window.open(photo.url, "_blank", "noopener,noreferrer")}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white px-3 py-2 rounded-lg text-xs font-semibold"
          >
            <Download size={14} /> Download
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* -------------------------- Video Library -------------------------- */

interface VideoItem {
  id: string;
  title: string;
  category: string;
  uploadedBy: string;
  uploadedAt: string;
  url: string;
  fileName: string;
  description?: string;
}

function VideoLibrary({ canPost }: { canPost: boolean }) {
  const { data: apiPosts, isLoading } = useGetPosts();
  const createPostMutation = useCreatePost();
  const qc = useQueryClient();
  const [cat, setCat] = useState("All");
  const [search, setSearch] = useState("");
  const [player, setPlayer] = useState<VideoItem | null>(null);

  const videos = useMemo(() => {
    const out: VideoItem[] = [];
    for (const post of apiPosts ?? []) {
      const author = (post as any)?.author;
      const authorName = typeof author?.name === "string" ? author.name : "—";
      const attachments = parsePostAttachments(post).filter((a) => a.kind === "video");
      for (const a of attachments) {
        out.push({
          id: a.id ?? `${post.id}:${a.url}`,
          title: post.title || a.fileName || "Video",
          category: post.category || "Other",
          uploadedBy: authorName,
          uploadedAt: new Date(post.createdAt).toLocaleString(),
          url: a.url,
          fileName: a.fileName,
          description: post.body || "",
        });
      }
    }
    return out;
  }, [apiPosts]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const v of videos) set.add(v.category || "Other");
    return ["All", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [videos]);

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (cat !== "All" && v.category !== cat) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return v.title.toLowerCase().includes(q) || v.uploadedBy.toLowerCase().includes(q);
    });
  }, [videos, cat, search]);

  const featured = filtered[0];
  const rest = filtered.slice(1);

  const uploadVideo = async (files: FileList | null) => {
    try {
      if (!files || files.length === 0) return;
      const f = files.item(0);
      const title = f?.name ? f.name.slice(0, 80) : "Video upload";
      const category = cat !== "All" ? cat : "Technical";
      const created = await createPostMutation.mutateAsync({
        data: { title, body: "", category },
      });
      for (const file of Array.from(files).slice(0, 1)) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetch(`/api/posts/${created.id}/attachments`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!res.ok) throw new Error(await res.text());
      }
      await qc.invalidateQueries({ queryKey: getGetPostsQueryKey() });
    } catch (err) {
      console.error("Failed to upload video:", err);
    }
  };

  return (
    <>
      <GalleryToolbar
        search={search}
        setSearch={setSearch}
        filter={cat}
        setFilter={setCat}
        options={categories}
        layoutId="videoFilter"
        placeholder="Search videos…"
        canPost={canPost}
        uploadLabel="Upload video"
        uploadIcon={Video}
        accept="video/*"
        onUploadFiles={uploadVideo}
      />

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">No videos match your filters.</div>
      ) : (
        <>
          {/* Featured */}
          {featured && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={() => setPlayer(featured)}
              className="group relative w-full aspect-[16/7] rounded-2xl overflow-hidden bg-black mb-5 text-left shadow-sm hover:shadow-xl transition-shadow"
            >
              <video src={featured.url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover opacity-80" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                  <Play size={32} fill="currentColor" className="ml-1" />
                </div>
              </div>
              <span className="absolute top-4 left-4 text-[10px] font-bold uppercase tracking-wider text-white bg-primary px-2 py-1 rounded">
                Featured
              </span>
              <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/80 mb-1">{featured.category}</div>
                <div className="text-xl font-bold mb-1">{featured.title}</div>
                <div className="text-xs text-white/80">{featured.uploadedBy} · {featured.uploadedAt}</div>
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
                <div className="relative aspect-video bg-black group">
                  <video src={v.url} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover opacity-80" />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/95 text-primary flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                      <Play size={22} fill="currentColor" className="ml-1" />
                    </div>
                  </div>
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
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-black">
          <video src={video.url} controls autoPlay className="w-full h-full object-contain" />
        </div>
        <div className="mt-4 text-white">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70 mb-1">{video.category}</div>
          <div className="text-xl font-bold">{video.title}</div>
          <div className="text-xs text-white/70 mt-1">{video.uploadedBy} · {video.uploadedAt}</div>
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
  canPost, uploadLabel, uploadIcon: UploadIcon, accept, multiple, onUploadFiles,
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
  onUploadFiles?: (files: FileList | null) => void;
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
            <input
              ref={fileRef}
              type="file"
              accept={accept}
              multiple={multiple}
              className="hidden"
              onChange={(e) => {
                void onUploadFiles?.(e.target.files);
                e.currentTarget.value = "";
              }}
            />
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
  const { data: apiPosts, isLoading } = useGetPosts();
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");

  const courses = useMemo(() => {
    const out: Array<{
      id: string;
      title: string;
      body: string;
      category: string;
      createdAt: string;
      authorName: string;
      files: Attachment[];
    }> = [];
    for (const post of apiPosts ?? []) {
      const attachments = parsePostAttachments(post);
      const files = attachments.filter((a) => a.kind === "file");
      const isCourse =
        files.length > 0 ||
        String(post.category ?? "").toLowerCase() === "course" ||
        String(post.title ?? "").toLowerCase().includes("course");
      if (!isCourse) continue;
      const author = (post as any)?.author;
      const authorName = typeof author?.name === "string" ? author.name : "—";
      out.push({
        id: post.id,
        title: post.title || "Course",
        body: post.body || "",
        category: post.category || "Course",
        createdAt: post.createdAt,
        authorName,
        files,
      });
    }
    return out;
  }, [apiPosts]);

  const filtered = useMemo(() => {
    return courses.filter((c) => {
      if (filter !== "All" && c.category !== filter) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        c.title.toLowerCase().includes(q) ||
        c.body.toLowerCase().includes(q) ||
        c.authorName.toLowerCase().includes(q)
      );
    });
  }, [courses, filter, search]);

  const totalCourses = courses.length;
  const withFiles = courses.filter((c) => c.files.length > 0).length;
  const categoriesCount = new Set(courses.map((c) => c.category)).size;

  return (
    <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: "Total Courses", value: totalCourses, icon: BookOpen, color: "from-primary to-sky-700", bg: "bg-primary/10", text: "text-primary" },
          { label: "With Files", value: withFiles, icon: Paperclip, color: "from-emerald-500 to-emerald-700", bg: "bg-emerald-50", text: "text-emerald-600" },
          { label: "Categories", value: categoriesCount, icon: GraduationCap, color: "from-amber-500 to-orange-600", bg: "bg-amber-50", text: "text-amber-600" },
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
                    {s.value}
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

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : (
        <CourseGrid filtered={filtered} />
      )}
    </>
  );
}

function CourseGrid({
  filtered,
}: {
  filtered: Array<{
    id: string;
    title: string;
    body: string;
    category: string;
    createdAt: string;
    authorName: string;
    files: Attachment[];
  }>;
}) {
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
            className="bg-white rounded-2xl border border-gray-100 overflow-hidden group hover:shadow-xl transition-shadow"
          >
            <div className="relative h-28 bg-gradient-to-br from-primary/10 to-sky-50 overflow-hidden">
              <GraduationCap className="absolute -bottom-6 -right-6 text-primary/10" size={110} />
              <div className="p-5">
                <div className="text-xs font-medium text-gray-500">{c.category}</div>
                <h3 className="font-bold text-gray-900 mt-1 line-clamp-2">{c.title}</h3>
                <div className="text-[11px] text-gray-500 mt-1">{c.authorName} · {new Date(c.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
            <div className="p-5">
              {c.body && (
                <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-line line-clamp-4">
                  {c.body}
                </div>
              )}
              {c.files.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {c.files.slice(0, 5).map((f) => (
                    <button
                      key={f.id ?? `${f.url}:${f.fileName}`}
                      onClick={() => window.open(f.url, "_blank", "noopener,noreferrer")}
                      className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <Paperclip size={14} className="text-gray-500 shrink-0" />
                        <div className="text-xs font-semibold text-gray-800 truncate">{f.fileName}</div>
                      </div>
                      <Download size={14} className="text-gray-500 shrink-0" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-4 text-xs text-gray-400">No course files uploaded.</div>
              )}
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
