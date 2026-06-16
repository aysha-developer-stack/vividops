import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Download, Eye, Folder, Search, Trash2, ExternalLink, FileText } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import Pagination, { usePagination } from "@/components/Pagination";
import { useListJobs, type Job as ApiJob } from "@workspace/api-client-react";
import type { Role } from "@/lib/roles";

type FileRow = {
  id: string;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  name: string;
  uploadedBy: string;
  uploadedAt: string;
  kind: "job" | "completed";
  status: "available" | "archived";
  url?: string;
};

type FolderRow = {
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  files: FileRow[];
  jobFilesCount: number;
  completedFilesCount: number;
  lastUploadedAt: string;
  lastUploadedBy: string;
};

export default function SuperAdminFiles({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const jobsQuery = useListJobs();
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<"all" | "job" | "completed">("all");
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [openJobIds, setOpenJobIds] = useState<Record<string, boolean>>({});
  const jobBase = role === "admin" ? "/admin/jobs" : "/super-admin/jobs";
  const [rows, setRows] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const jobs: ApiJob[] = jobsQuery.data ?? [];
    if (jobs.length === 0) {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const results = await Promise.all(
          jobs.map(async (j) => {
            const res = await fetch(`/api/jobs/${j.id}/attachments`, { credentials: "include" });
            if (!res.ok) return [] as FileRow[];
            const data = (await res.json()) as unknown;
            if (!Array.isArray(data)) return [] as FileRow[];
            return (data as any[]).map((a) => {
              const uploadedByRole = a?.uploadedBy?.role as Role | undefined;
              const uploadedByName = (a?.uploadedBy?.name as string | undefined) ?? "—";
              const createdAt = a?.createdAt ? new Date(a.createdAt).toLocaleString() : "—";
              const fileName = (a?.fileName as string | undefined) ?? "file";
              const fileUrl = (a?.fileUrl as string | undefined) ?? undefined;
              return {
                id: String(a?.id ?? `${j.id}-${fileName}`),
                jobId: j.id,
                jobNumber: j.number,
                jobTitle: j.title,
                name: fileName,
                uploadedBy: uploadedByName,
                uploadedAt: createdAt,
                kind: uploadedByRole === "user" ? "completed" : "job",
                status: "available",
                url: fileUrl,
              } satisfies FileRow;
            });
          }),
        );
        const flat = results.flat();
        if (!cancelled) setRows(flat);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [jobsQuery.data]);

  const files = useMemo(() => rows.filter((f) => !deletedIds.includes(f.id)), [rows, deletedIds]);

  const folders = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byJob = new Map<string, { jobNumber: string; jobTitle: string; files: FileRow[] }>();

    for (const f of files) {
      if (kind !== "all" && f.kind !== kind) continue;
      const existing = byJob.get(f.jobId);
      if (existing) {
        existing.files.push(f);
      } else {
        byJob.set(f.jobId, { jobNumber: f.jobNumber, jobTitle: f.jobTitle, files: [f] });
      }
    }

    const out: FolderRow[] = [];
    for (const [jobId, group] of byJob.entries()) {
      const jobMatches =
        !q ||
        group.jobNumber.toLowerCase().includes(q) ||
        group.jobTitle.toLowerCase().includes(q);

      const filteredFiles = jobMatches
        ? group.files
        : group.files.filter((f) => f.name.toLowerCase().includes(q) || f.uploadedBy.toLowerCase().includes(q));

      if (filteredFiles.length === 0) continue;

      const jobFilesCount = filteredFiles.filter((f) => f.kind === "job").length;
      const completedFilesCount = filteredFiles.filter((f) => f.kind === "completed").length;
      const last = filteredFiles[0];

      out.push({
        jobId,
        jobNumber: group.jobNumber,
        jobTitle: group.jobTitle,
        files: filteredFiles,
        jobFilesCount,
        completedFilesCount,
        lastUploadedAt: last?.uploadedAt ?? "—",
        lastUploadedBy: last?.uploadedBy ?? "—",
      });
    }

    out.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
    return out;
  }, [files, search, kind]);

  const p = usePagination(folders, 10);

  return (
    <DashboardLayout title="Files Management" role={role}>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 flex-1 max-w-xl focus-within:border-primary transition-colors">
          <Search size={16} className="text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by file, job, or uploader…"
            className="bg-transparent text-sm flex-1 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "job", "completed"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-4 py-2 rounded-xl text-xs font-bold border transition-colors ${
                kind === k ? "bg-primary text-white border-primary" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
              }`}
            >
              {k === "all" ? "All Files" : k === "job" ? "Job Files" : "Completed Files"}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                {["Folder / File", "Job", "Uploaded", "Type", "Status", ""].map((h) => (
                  <th key={h} className="text-left px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <AnimatePresence>
                {p.pageItems.map((folderRow, i) => {
                  const isOpen = !!openJobIds[folderRow.jobId];
                  return (
                    <Fragment key={folderRow.jobId}>
                      <motion.tr
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ delay: i * 0.02 }}
                        className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
                      >
                        <td className="px-6 py-4">
                          <button
                            onClick={() => setOpenJobIds((prev) => ({ ...prev, [folderRow.jobId]: !isOpen }))}
                            className="flex items-center gap-3 min-w-[260px] text-left"
                          >
                            <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500">
                              {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                                <Folder size={16} className="text-primary" />
                                <span className="truncate">{folderRow.jobTitle}</span>
                              </div>
                              <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                                {folderRow.files.length} files • Job: {folderRow.jobFilesCount} • Completed: {folderRow.completedFilesCount}
                              </div>
                            </div>
                          </button>
                        </td>
                        <td className="px-6 py-4">
                          <Link href={`${jobBase}/${folderRow.jobId}?tab=files`}>
                            <span className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline cursor-pointer">
                              {folderRow.jobNumber} <ExternalLink size={12} className="text-gray-300" />
                            </span>
                          </Link>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-xs text-gray-600">{folderRow.lastUploadedBy}</div>
                          <div className="text-[11px] text-gray-400">{folderRow.lastUploadedAt}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-1 rounded-lg border text-[10px] font-bold uppercase bg-gray-50 text-gray-700 border-gray-200">
                            folder
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center px-2 py-1 rounded-lg border text-[10px] font-bold uppercase bg-gray-50 text-gray-700 border-gray-200">
                            available
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right" />
                      </motion.tr>

                      {isOpen && (
                        <>
                          {folderRow.files.map((f) => (
                            <tr key={f.id} className="border-t border-gray-50 hover:bg-gray-50/40">
                              <td className="px-6 py-4">
                                <div className="flex items-center gap-3 min-w-[260px] pl-12">
                                  <div className="w-9 h-9 rounded-xl bg-white border border-gray-200 flex items-center justify-center text-gray-500">
                                    <FileText size={16} />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-gray-900 truncate">{f.name}</div>
                                    <div className="text-[11px] text-gray-500 mt-0.5 truncate">{f.uploadedAt}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <Link href={`${jobBase}/${f.jobId}?tab=files`}>
                                  <span className="inline-flex items-center gap-2 text-xs font-bold text-primary hover:underline cursor-pointer">
                                    <Folder size={14} /> {f.jobNumber} <ExternalLink size={12} className="text-gray-300" />
                                  </span>
                                </Link>
                              </td>
                              <td className="px-6 py-4 text-xs text-gray-600">{f.uploadedBy}</td>
                              <td className="px-6 py-4">
                                <span
                                  className={`inline-flex items-center px-2 py-1 rounded-lg border text-[10px] font-bold uppercase ${
                                    f.kind === "job" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  }`}
                                >
                                  {f.kind === "job" ? "Job" : "Completed"}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className="inline-flex items-center px-2 py-1 rounded-lg border text-[10px] font-bold uppercase bg-gray-50 text-gray-700 border-gray-200">
                                  {f.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    onClick={() => {
                                      if (f.url) window.open(f.url, "_blank", "noopener,noreferrer");
                                    }}
                                    className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                    title="View"
                                  >
                                    <Eye size={14} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (f.url) window.open(f.url, "_blank", "noopener,noreferrer");
                                    }}
                                    className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
                                    title="Download"
                                  >
                                    <Download size={14} />
                                  </button>
                                  <button
                                    onClick={() => {
                                      const ok = window.confirm(`Delete ${f.name}?`);
                                      if (!ok) return;
                                      setDeletedIds((prev) => (prev.includes(f.id) ? prev : [...prev, f.id]));
                                    }}
                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Delete"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </>
                      )}
                    </Fragment>
                  );
                })}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {(jobsQuery.isLoading || loading) && <div className="text-center py-12 text-sm text-gray-400">Loading files…</div>}
        {!jobsQuery.isLoading && !loading && folders.length === 0 && <div className="text-center py-12 text-sm text-gray-400">No files found.</div>}
        {folders.length > 0 && (
          <div className="border-t border-gray-100">
            <Pagination
              page={p.page}
              totalPages={p.totalPages}
              total={p.total}
              pageSize={p.pageSize}
              onChange={p.setPage}
              label="folders"
            />
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
