import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Plus, ScrollText, Trash2, X } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { useDashboardSearch } from "@/lib/pageSearch";
import type { Role } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import {
  createBuilderSpec,
  deleteBuilderSpec,
  fetchBuilderSpecSuggestions,
  fetchBuilderSpecs,
  updateBuilderSpec,
  type BuilderSpecRecord,
} from "@/lib/builderSpecsApi";

const NAME_MAX = 160;
const BODY_MAX = 20000;
const INPUT =
  "w-full mt-1 border-2 border-gray-200 rounded-xl px-3 py-2.5 text-sm !text-gray-900 !placeholder:text-gray-400 bg-white focus:outline-none focus:border-primary";

type Draft = { builderName: string; body: string };

function emptyDraft(): Draft {
  return { builderName: "", body: "" };
}

export default function BuilderSpecs({ role = "admin" as Role }: { role?: Role } = {}) {
  const { toast } = useToast();
  const { search, headerSearch } = useDashboardSearch("Search builders…");
  const [rows, setRows] = useState<BuilderSpecRecord[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [error, setError] = useState<string | null>(null);

  const selected = selectedId && selectedId !== "new" ? rows.find((row) => row.id === selectedId) ?? null : null;
  const dirty =
    selectedId === "new"
      ? draft.builderName.trim().length > 0 || draft.body.trim().length > 0
      : !!selected &&
        (draft.builderName.trim() !== selected.builderName.trim() || draft.body.trim() !== selected.body.trim());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) => row.builderName.toLowerCase().includes(q) || row.body.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [list, clients] = await Promise.all([fetchBuilderSpecs(), fetchBuilderSpecSuggestions().catch(() => [])]);
      setRows(list);
      setSuggestions(clients);
    } catch (err) {
      toast({
        title: "Could not load builder specs",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const startNew = (name = "") => {
    setSelectedId("new");
    setDraft({ builderName: name, body: "" });
    setError(null);
  };

  const openRow = (row: BuilderSpecRecord) => {
    setSelectedId(row.id);
    setDraft({ builderName: row.builderName, body: row.body });
    setError(null);
  };

  const save = async () => {
    const builderName = draft.builderName.trim();
    const body = draft.body.trim();
    if (!builderName) {
      setError("Builder name is required");
      return;
    }
    if (!body) {
      setError("Write the specs this builder wants workers to follow");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (selectedId === "new") {
        const created = await createBuilderSpec({ builderName, body });
        setRows((prev) => [created, ...prev.filter((row) => row.id !== created.id)]);
        setSuggestions((prev) => prev.filter((name) => name.toLowerCase() !== created.builderName.toLowerCase()));
        setSelectedId(created.id);
        setDraft({ builderName: created.builderName, body: created.body });
        toast({ title: "Builder specs saved", description: `${created.builderName} will attach to new jobs for this builder.` });
      } else if (selectedId) {
        const updated = await updateBuilderSpec(selectedId, { builderName, body });
        setRows((prev) => [updated, ...prev.filter((row) => row.id !== updated.id)]);
        setDraft({ builderName: updated.builderName, body: updated.body });
        toast({
          title: "Builder specs updated",
          description: "New jobs for this builder will get the updated text. Existing jobs keep the copy they already have.",
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected || selectedId === "new") return;
    if (
      !window.confirm(
        `Delete specs for ${selected.builderName}? Jobs that already have a copy will keep it. New jobs will no longer receive these specs.`,
      )
    ) {
      return;
    }
    setSaving(true);
    try {
      await deleteBuilderSpec(selected.id);
      setRows((prev) => prev.filter((row) => row.id !== selected.id));
      setSelectedId(null);
      setDraft(emptyDraft());
      toast({ title: "Builder specs deleted" });
      void fetchBuilderSpecSuggestions()
        .then(setSuggestions)
        .catch(() => {});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DashboardLayout title="Builder Specs" role={role} headerSearch={headerSearch}>
      <div className="mb-6 max-w-3xl">
        <p className="text-sm text-gray-600">
          Write each builder’s requirements once. When a job is created or assigned for that builder, these specs are
          copied onto the job so the worker can follow them.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-gray-100 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">Builders</h2>
            <button
              type="button"
              onClick={() => startNew()}
              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-[11px] font-bold text-white"
            >
              <Plus size={12} /> New
            </button>
          </div>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-gray-400">
              <Loader2 size={18} className="animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-xs text-gray-400">
              {rows.length === 0 ? "No builder specs yet" : "No matches"}
            </div>
          ) : (
            <div className="max-h-[28rem] space-y-1 overflow-y-auto">
              {filtered.map((row) => {
                const active = selectedId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openRow(row)}
                    className={`w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
                      active ? "bg-primary/10 text-primary" : "hover:bg-gray-50 text-gray-800"
                    }`}
                  >
                    <div className="truncate text-sm font-semibold">{row.builderName}</div>
                    <div className="mt-0.5 line-clamp-1 text-[11px] text-gray-500">{row.body}</div>
                  </button>
                );
              })}
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                Clients without specs
              </div>
              <div className="flex flex-wrap gap-1.5">
                {suggestions.slice(0, 12).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => startNew(name)}
                    className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:border-primary hover:text-primary"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <section className="rounded-2xl border border-gray-100 bg-white p-6">
          {!selectedId ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <ScrollText size={22} />
              </div>
              <h3 className="text-base font-bold text-gray-900">Select a builder or add specs</h3>
              <p className="mt-1 max-w-sm text-sm text-gray-500">
                Specs attach automatically when a job uses this builder name as the client.
              </p>
              <button
                type="button"
                onClick={() => startNew()}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white"
              >
                <Plus size={14} /> Add builder specs
              </button>
            </div>
          ) : (
            <div>
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">
                    {selectedId === "new" ? "New builder specs" : selected?.builderName}
                  </h3>
                  <p className="mt-1 text-xs text-gray-500">
                    Match the client name used on jobs. Editing here does not change jobs that already have a copy.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setDraft(emptyDraft());
                    setError(null);
                  }}
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-50 hover:text-gray-700"
                  aria-label="Close editor"
                >
                  <X size={16} />
                </button>
              </div>

              <label className="block text-xs font-bold uppercase tracking-wide text-gray-500">
                Builder / client name
                <input
                  value={draft.builderName}
                  maxLength={NAME_MAX}
                  onChange={(e) => setDraft((prev) => ({ ...prev, builderName: e.target.value }))}
                  placeholder="e.g. Acme Homes"
                  className={INPUT}
                />
              </label>

              <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-gray-500">
                Specs the worker should follow
                <textarea
                  value={draft.body}
                  maxLength={BODY_MAX}
                  onChange={(e) => setDraft((prev) => ({ ...prev, body: e.target.value }))}
                  placeholder="Write the builder’s requirements, photo rules, report format, materials, etc."
                  rows={14}
                  className={`${INPUT} resize-y min-h-[16rem]`}
                />
              </label>
              <div className="mt-1 text-right text-[11px] text-gray-400">
                {draft.body.length.toLocaleString()} / {BODY_MAX.toLocaleString()}
              </div>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                {selectedId !== "new" ? (
                  <button
                    type="button"
                    onClick={() => void remove()}
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:text-red-800 disabled:opacity-50"
                  >
                    <Trash2 size={14} /> Delete
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !dirty}
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                  {selectedId === "new" ? "Save specs" : "Save changes"}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
