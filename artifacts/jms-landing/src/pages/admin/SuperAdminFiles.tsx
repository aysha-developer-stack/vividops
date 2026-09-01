import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight, Download, Eye, Folder, Trash2, ExternalLink, Layers } from "lucide-react";
import FileExtensionIcon from "@/components/FileExtensionIcon";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardSearch } from "@/lib/pageSearch";
import Pagination, { usePagination } from "@/components/Pagination";
import { useListJobs, type Job as ApiJob } from "@workspace/api-client-react";
import type { Role } from "@/lib/roles";
import { jobFieldForTitle, sortJobFields } from "@/lib/jobForm";
import { downloadNamedFile, jobAttachmentDownloadUrl, jobAttachmentPreviewUrl } from "@/lib/downloadFile";
import AttachmentPreviewDialog, { canOpenAttachmentPreview } from "@/components/AttachmentPreviewDialog";
import { prefetchImagePreview } from "@/lib/attachmentPreview";

type FileRow = {
  id: string;
  jobId: string;
  jobNumber: string;
  jobTitle: string;
  name: string;
  fileType?: string | null;
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
  field: string;
  files: FileRow[];
  completedFilesCount: number;
  lastUploadedAt: string;
  lastUploadedBy: string;
};

type FieldGroupRow = {
  field: string;
  jobs: FolderRow[];
  jobCount: number;
  totalFiles: number;
};

export default function SuperAdminFiles({ role = "super-admin" as Role }: { role?: Role } = {}) {
  const jobsQuery = useListJobs();
  const { search, headerSearch } = useDashboardSearch("Search files…");
  const [kind, setKind] = useState<"all" | "job" | "completed">("all");
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [openFieldIds, setOpenFieldIds] = useState<Record<string, boolean>>({});
  const [openJobIds, setOpenJobIds] = useState<Record<string, boolean>>({});
  const jobBase = role === "admin" ? "/admin/jobs" : "/super-admin/jobs";
  const [rows, setRows] = useState<FileRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewFile, setPreviewFile] = useState<FileRow | null>(null);

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
              const fileType = (a?.fileType as string | null | undefined) ?? null;
              return {
                id: String(a?.id ?? `${j.id}-${fileName}`),
                jobId: j.id,
                jobNumber: j.number,
                jobTitle: j.title,
                name: fileName,
                fileType,
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

  useEffect(() => {
    setOpenFieldIds({});
    setOpenJobIds({});
  }, [kind]);

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
      const field = jobFieldForTitle(group.jobTitle);
      const jobMatches =
        !q ||
        group.jobNumber.toLowerCase().includes(q) ||
        group.jobTitle.toLowerCase().includes(q) ||
        field.toLowerCase().includes(q);

      const filteredFiles = jobMatches
        ? group.files
        : group.files.filter((f) => f.name.toLowerCase().includes(q) || f.uploadedBy.toLowerCase().includes(q));

      if (filteredFiles.length === 0) continue;

      const completedFilesCount = filteredFiles.filter((f) => f.kind === "completed").length;
      const last = filteredFiles[0];

      out.push({
        jobId,
        jobNumber: group.jobNumber,
        jobTitle: group.jobTitle,
        field,
        files: filteredFiles,
        completedFilesCount,
        lastUploadedAt: last?.uploadedAt ?? "—",
        lastUploadedBy: last?.uploadedBy ?? "—",
      });
    }

    out.sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
    return out;
  }, [files, search, kind]);

  const fieldGroups = useMemo((): FieldGroupRow[] | null => {
    if (kind !== "job") return null;

    const byField = new Map<string, FolderRow[]>();
    for (const folder of folders) {
      const list = byField.get(folder.field) ?? [];
      list.push(folder);
      byField.set(folder.field, list);
    }

    return sortJobFields([...byField.keys()]).map((field) => {
      const jobs = byField.get(field) ?? [];
      return {
        field,
        jobs,
        jobCount: jobs.length,
        totalFiles: jobs.reduce((sum, job) => sum + job.files.length, 0),
      };
    });
  }, [folders, kind]);

  const flatPagination = usePagination(folders, 100);
  const fieldPagination = usePagination(fieldGroups ?? [], 20);

  const deleteFile = async (f: FileRow) => {
    const ok = window.confirm(`Delete ${f.name}? This cannot be undone.`);
    if (!ok) return;
    try {
      const res = await fetch(`/api/jobs/${f.jobId}/attachments/${f.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(data.message || "Failed to delete file");
      }
      setDeletedIds((prev) => (prev.includes(f.id) ? prev : [...prev, f.id]));
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Failed to delete file");
    }
  };

  const renderFileActions = (f: FileRow) => (
    <div className="inline-flex items-center gap-2">
      <button
        onMouseEnter={() =>
          prefetchImagePreview(jobAttachmentPreviewUrl(f.jobId, f.id), f.name, f.fileType)
        }
        onClick={() => {
          if (!canOpenAttachmentPreview(f.name, f.fileType)) {
            window.alert("This file type cannot be previewed in the browser. Please use Download.");
            return;
          }
          setPreviewFile(f);
        }}
        className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
        title="View"
      >
        <Eye size={14} />
      </button>
      <button
        onClick={() => {
          void downloadNamedFile(jobAttachmentDownloadUrl(f.jobId, f.id), f.name).catch(() => {
            window.alert("Download failed. Please try again.");
          });
        }}
        className="p-2 text-gray-400 hover:text-primary hover:bg-primary/5 rounded-lg transition-colors"
        title="Download"
      >
        <Download size={14} />
      </button>
      <button
        onClick={() => void deleteFile(f)}
        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        title="Delete"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );

  const renderFileRow = (f: FileRow, indentClass: string) => (
    <tr key={f.id} className="border-t border-gray-50 hover:bg-gray-50/40">
      <td className="px-6 py-4">
        <div className={`flex items-start gap-3 min-w-0 ${indentClass}`}>
          <FileExtensionIcon fileName={f.name} size="sm" />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 break-words whitespace-normal leading-snug">{f.name}</div>
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
      <td className="px-6 py-4 text-right">{renderFileActions(f)}</td>
    </tr>
  );

  const renderJobFolderRow = (folderRow: FolderRow, indentClass: string, rowIndex: number) => {
    const isOpen = !!openJobIds[folderRow.jobId];
    return (
      <Fragment key={folderRow.jobId}>
        <motion.tr
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: rowIndex * 0.02 }}
          className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50"
        >
          <td className="px-6 py-4">
            <button
              onClick={() => setOpenJobIds((prev) => ({ ...prev, [folderRow.jobId]: !isOpen }))}
              className={`flex items-center gap-3 min-w-[260px] text-left ${indentClass}`}
            >
              <div className="w-9 h-9 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center text-gray-500 shrink-0">
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-2">
                  <Folder size={16} className="text-primary shrink-0" />
                  <span className="truncate">{folderRow.jobNumber}</span>
                </div>
                <div className="text-[11px] text-gray-500 mt-0.5 truncate">
                  {folderRow.jobTitle} · {folderRow.files.length} files
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
        {isOpen && folderRow.files.map((f) => renderFileRow(f, kind === "job" ? "pl-16" : "pl-12"))}
      </Fragment>
    );
  };

  const renderFlatFolderRow = (folderRow: FolderRow, rowIndex: number) => {
    const isOpen = !!openJobIds[folderRow.jobId];
    return (
      <Fragment key={folderRow.jobId}>
        <motion.tr
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ delay: rowIndex * 0.02 }}
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
                  {folderRow.files.length} files • Completed: {folderRow.completedFilesCount}
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
        {isOpen && folderRow.files.map((f) => renderFileRow(f, "pl-12"))}
      </Fragment>
    );
  };

  const listEmpty = kind === "job" ? (fieldGroups?.length ?? 0) === 0 : folders.length === 0;

  return (
    <DashboardLayout title="Files Management" role={role} headerSearch={headerSearch}>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5 flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        {kind === "job" && (
          <p className="text-xs text-gray-500">
            Job files are grouped by field (Engineering, Architectural Plan, Robot Structure, etc.). Open a field to see its jobs.
          </p>
        )}
        <div className="flex gap-2 lg:ml-auto">
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
                {kind === "job" && fieldGroups
                  ? fieldPagination.pageItems.map((group, i) => {
                      const fieldOpen = !!openFieldIds[group.field];
                      return (
                        <Fragment key={group.field}>
                          <motion.tr
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.02 }}
                            className="border-b border-gray-100 bg-primary/[0.03] hover:bg-primary/[0.06]"
                          >
                            <td className="px-6 py-4" colSpan={6}>
                              <button
                                onClick={() =>
                                  setOpenFieldIds((prev) => ({ ...prev, [group.field]: !fieldOpen }))
                                }
                                className="flex items-center gap-3 min-w-[260px] text-left w-full"
                              >
                                <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                                  {fieldOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
                                    <Layers size={16} className="text-primary shrink-0" />
                                    <span>{group.field}</span>
                                  </div>
                                  <div className="text-[11px] text-gray-500 mt-0.5">
                                    {group.jobCount} {group.jobCount === 1 ? "job" : "jobs"} · {group.totalFiles} job {group.totalFiles === 1 ? "file" : "files"}
                                  </div>
                                </div>
                              </button>
                            </td>
                          </motion.tr>
                          {fieldOpen &&
                            group.jobs.map((folderRow, jobIndex) =>
                              renderJobFolderRow(folderRow, "pl-8", jobIndex),
                            )}
                        </Fragment>
                      );
                    })
                  : flatPagination.pageItems.map((folderRow, i) => renderFlatFolderRow(folderRow, i))}
              </AnimatePresence>
            </tbody>
          </table>
        </div>

        {(jobsQuery.isLoading || loading) && <div className="text-center py-12 text-sm text-gray-400">Loading files…</div>}
        {!jobsQuery.isLoading && !loading && listEmpty && (
          <div className="text-center py-12 text-sm text-gray-400">No files found.</div>
        )}
        {kind === "job" && (fieldGroups?.length ?? 0) > 0 && (
          <div className="border-t border-gray-100">
            <Pagination
              page={fieldPagination.page}
              totalPages={fieldPagination.totalPages}
              total={fieldPagination.total}
              pageSize={fieldPagination.pageSize}
              onChange={fieldPagination.setPage}
              label="fields"
            />
          </div>
        )}
        {kind !== "job" && folders.length > 0 && (
          <div className="border-t border-gray-100">
            <Pagination
              page={flatPagination.page}
              totalPages={flatPagination.totalPages}
              total={flatPagination.total}
              pageSize={flatPagination.pageSize}
              onChange={flatPagination.setPage}
              label="folders"
            />
          </div>
        )}
      </div>
      {previewFile && (
        <AttachmentPreviewDialog
          open={!!previewFile}
          onOpenChange={(open) => !open && setPreviewFile(null)}
          fileName={previewFile.name}
          fileType={previewFile.fileType}
          previewUrl={jobAttachmentPreviewUrl(previewFile.jobId, previewFile.id)}
          onDownload={() => {
            void downloadNamedFile(
              jobAttachmentDownloadUrl(previewFile.jobId, previewFile.id),
              previewFile.name,
            ).catch(() => {
              window.alert("Download failed. Please try again.");
            });
          }}
        />
      )}
    </DashboardLayout>
  );
}
