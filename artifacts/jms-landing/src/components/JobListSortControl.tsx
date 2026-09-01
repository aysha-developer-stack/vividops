import { useState } from "react";
import { ArrowDownUp, Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  type JobListSortMode,
  ACTIVE_STATUS_SORT_NOTE,
  JOB_LIST_SORT_HINTS,
  JOB_LIST_SORT_LABELS,
  storeJobListSort,
} from "@/lib/jobListSort";

type Props = {
  value: JobListSortMode;
  onChange: (mode: JobListSortMode) => void;
  variant?: "toolbar" | "sidebar";
};

const MODES = Object.entries(JOB_LIST_SORT_LABELS) as [JobListSortMode, string][];

export default function JobListSortControl({ value, onChange, variant = "toolbar" }: Props) {
  const [open, setOpen] = useState(false);
  const isToolbar = variant === "toolbar";
  const selectedLabel = JOB_LIST_SORT_LABELS[value];

  const handleChange = (mode: JobListSortMode) => {
    onChange(mode);
    storeJobListSort(mode);
    setOpen(false);
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Sort jobs: ${selectedLabel}`}
          className={
            isToolbar
              ? "inline-flex min-w-[148px] items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 shadow-none transition-colors hover:bg-white focus:outline-none focus:border-primary data-[state=open]:border-primary data-[state=open]:bg-white"
              : "inline-flex w-full items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-900 shadow-none transition-colors focus:outline-none focus:border-primary data-[state=open]:border-primary"
          }
        >
          <ArrowDownUp size={isToolbar ? 15 : 13} className="text-gray-500 shrink-0" />
          <span className="truncate flex-1 text-left whitespace-nowrap">
            {open ? "Sort by" : selectedLabel}
          </span>
          <ChevronDown
            size={isToolbar ? 15 : 13}
            className={`text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="end"
        sideOffset={8}
        avoidCollisions
        className="z-50 w-[var(--radix-dropdown-menu-trigger-width)] min-w-[280px] border border-gray-200 bg-white p-1.5 text-gray-900 shadow-xl"
      >
        <div className="px-2.5 py-2 mb-1 border-b border-gray-100">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-primary">Active jobs first</div>
          <div className="text-[11px] text-gray-500 leading-snug mt-0.5">{ACTIVE_STATUS_SORT_NOTE}</div>
        </div>
        {MODES.map(([mode, label]) => {
          const selected = value === mode;
          return (
            <DropdownMenuItem
              key={mode}
              onSelect={(event) => {
                event.preventDefault();
                handleChange(mode);
              }}
              className="cursor-pointer rounded-lg px-2 py-2 focus:bg-primary/10 focus:text-gray-900 data-[highlighted]:bg-primary/10 data-[highlighted]:text-gray-900"
            >
              <div className="flex w-full items-start gap-2.5">
                <Check
                  size={14}
                  className={`mt-0.5 shrink-0 ${selected ? "text-primary opacity-100" : "opacity-0"}`}
                />
                <div className="min-w-0">
                  <div className="font-semibold text-gray-900">{label}</div>
                  <div className="text-[11px] font-normal text-gray-500 leading-snug whitespace-normal">
                    {JOB_LIST_SORT_HINTS[mode]}
                  </div>
                </div>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
