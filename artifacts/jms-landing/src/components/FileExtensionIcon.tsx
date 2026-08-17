import { cn } from "@/lib/utils";

type IconSize = "sm" | "md" | "lg";

type ExtStyle = {
  bg: string;
  border: string;
  text: string;
  label: string;
};

const EXT_STYLES: Record<string, ExtStyle> = {
  pdf: { bg: "bg-red-600", border: "border-red-700", text: "text-white", label: "PDF" },
  dwg: { bg: "bg-sky-600", border: "border-sky-700", text: "text-white", label: "DWG" },
  dxf: { bg: "bg-sky-600", border: "border-sky-700", text: "text-white", label: "DXF" },
  zip: { bg: "bg-amber-400", border: "border-amber-500", text: "text-amber-950", label: "ZIP" },
  rar: { bg: "bg-amber-400", border: "border-amber-500", text: "text-amber-950", label: "RAR" },
  "7z": { bg: "bg-amber-400", border: "border-amber-500", text: "text-amber-950", label: "7Z" },
  doc: { bg: "bg-blue-600", border: "border-blue-700", text: "text-white", label: "DOC" },
  docx: { bg: "bg-blue-600", border: "border-blue-700", text: "text-white", label: "DOC" },
  xls: { bg: "bg-emerald-600", border: "border-emerald-700", text: "text-white", label: "XLS" },
  xlsx: { bg: "bg-emerald-600", border: "border-emerald-700", text: "text-white", label: "XLS" },
  csv: { bg: "bg-emerald-600", border: "border-emerald-700", text: "text-white", label: "CSV" },
  ppt: { bg: "bg-orange-600", border: "border-orange-700", text: "text-white", label: "PPT" },
  pptx: { bg: "bg-orange-600", border: "border-orange-700", text: "text-white", label: "PPT" },
  txt: { bg: "bg-gray-500", border: "border-gray-600", text: "text-white", label: "TXT" },
  png: { bg: "bg-violet-600", border: "border-violet-700", text: "text-white", label: "PNG" },
  jpg: { bg: "bg-violet-600", border: "border-violet-700", text: "text-white", label: "JPG" },
  jpeg: { bg: "bg-violet-600", border: "border-violet-700", text: "text-white", label: "JPG" },
  gif: { bg: "bg-violet-600", border: "border-violet-700", text: "text-white", label: "GIF" },
  webp: { bg: "bg-violet-600", border: "border-violet-700", text: "text-white", label: "WEBP" },
  svg: { bg: "bg-violet-600", border: "border-violet-700", text: "text-white", label: "SVG" },
  mp4: { bg: "bg-pink-600", border: "border-pink-700", text: "text-white", label: "MP4" },
  mov: { bg: "bg-pink-600", border: "border-pink-700", text: "text-white", label: "MOV" },
};

const SIZE_CLASS: Record<IconSize, { box: string; text: string; fold: string }> = {
  sm: { box: "w-5 h-6", text: "text-[6px]", fold: "w-1.5 h-1.5" },
  md: { box: "w-6 h-7", text: "text-[7px]", fold: "w-1.5 h-1.5" },
  lg: { box: "w-7 h-8", text: "text-[8px]", fold: "w-2 h-2" },
};

export function fileExtensionFromName(fileName: string): string {
  const base = fileName.trim().split(/[/\\]/).pop() ?? fileName;
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

export function resolveFileExtensionStyle(fileName: string): ExtStyle {
  const ext = fileExtensionFromName(fileName);
  if (ext && EXT_STYLES[ext]) return EXT_STYLES[ext];
  const label = (ext || "FILE").slice(0, 4).toUpperCase();
  return {
    bg: "bg-gray-100",
    border: "border-gray-300",
    text: "text-gray-700",
    label,
  };
}

type FileExtensionIconProps = {
  fileName: string;
  size?: IconSize;
  className?: string;
};

export default function FileExtensionIcon({
  fileName,
  size = "md",
  className,
}: FileExtensionIconProps) {
  const style = resolveFileExtensionStyle(fileName);
  const sizeClass = SIZE_CLASS[size];

  return (
    <div
      className={cn(
        "relative shrink-0 rounded border shadow-sm flex items-end justify-center overflow-hidden",
        sizeClass.box,
        style.bg,
        style.border,
        className,
      )}
      title={fileExtensionFromName(fileName).toUpperCase() || "FILE"}
      aria-hidden
    >
      <span
        className={cn(
          "absolute top-0 right-0 bg-white/25",
          "border-l border-b border-white/30 rounded-bl-sm",
          sizeClass.fold,
        )}
      />
      <span
        className={cn(
          "font-extrabold leading-none tracking-tight pb-0.5 px-0.5",
          sizeClass.text,
          style.text,
        )}
      >
        {style.label}
      </span>
    </div>
  );
}
