import { ArrowDownUp } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  type JobListSortMode,
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
  const handleChange = (next: string) => {
    const mode = next as JobListSortMode;
    onChange(mode);
    storeJobListSort(mode);
  };

  const isToolbar = variant === "toolbar";

  return (
    <div className={isToolbar ? "shrink-0" : "w-full"}>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger
          className={
            isToolbar
              ? "h-auto min-w-[190px] gap-2 rounded-xl border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 shadow-none hover:bg-white focus:ring-0 focus:border-primary transition-colors"
              : "h-auto w-full gap-2 rounded-lg border-gray-200 bg-white px-2.5 py-2 text-xs font-semibold text-gray-900 shadow-none focus:ring-0 focus:border-primary transition-colors"
          }
        >
          <span className="flex items-center gap-2 min-w-0">
            <ArrowDownUp size={isToolbar ? 15 : 13} className="text-gray-400 shrink-0" />
            <SelectValue placeholder="Sort jobs" />
          </span>
        </SelectTrigger>
        <SelectContent align={isToolbar ? "end" : "start"} className="min-w-[220px]">
          {MODES.map(([mode, label]) => (
            <SelectItem key={mode} value={mode} className="py-2.5">
              <span className="flex flex-col items-start gap-0.5">
                <span className="font-semibold text-gray-900">{label}</span>
                <span className="text-[11px] font-normal text-gray-500 leading-snug">
                  {JOB_LIST_SORT_HINTS[mode]}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
