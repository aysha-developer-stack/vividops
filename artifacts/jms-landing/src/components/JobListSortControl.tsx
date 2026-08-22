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
  const selectedLabel = JOB_LIST_SORT_LABELS[value];

  return (
    <div className={isToolbar ? "shrink-0" : "w-full"}>
      <Select value={value} onValueChange={handleChange}>
        <SelectTrigger
          className={
            isToolbar
              ? "h-auto min-w-[168px] gap-2 rounded-xl border-gray-200 bg-gray-50 px-3 py-2.5 text-sm shadow-none hover:bg-white focus:ring-0 focus:border-primary transition-colors [&>span]:line-clamp-none"
              : "h-auto w-full gap-2 rounded-lg border-gray-200 bg-white px-2.5 py-2 text-xs shadow-none focus:ring-0 focus:border-primary transition-colors [&>span]:line-clamp-none"
          }
        >
          <span className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <ArrowDownUp size={isToolbar ? 15 : 13} className="text-gray-500 shrink-0" />
            <span className={`truncate font-semibold text-gray-900 ${isToolbar ? "text-sm" : "text-xs"}`}>
              {selectedLabel}
            </span>
          </span>
          <SelectValue className="sr-only" aria-label={selectedLabel} />
        </SelectTrigger>
        <SelectContent
          align={isToolbar ? "end" : "start"}
          className="z-50 min-w-[260px] border border-gray-200 bg-white text-gray-900 shadow-xl"
        >
          {MODES.map(([mode, label]) => (
            <SelectItem
              key={mode}
              value={mode}
              textValue={label}
              className="cursor-pointer py-2.5 pl-3 pr-8 text-gray-900 focus:bg-primary/10 focus:text-gray-900 data-[highlighted]:bg-primary/10 data-[highlighted]:text-gray-900"
            >
              <div className="flex flex-col items-start gap-0.5 pr-1">
                <span className="font-semibold text-gray-900">{label}</span>
                <span className="text-[11px] font-normal text-gray-500 leading-snug whitespace-normal">
                  {JOB_LIST_SORT_HINTS[mode]}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
