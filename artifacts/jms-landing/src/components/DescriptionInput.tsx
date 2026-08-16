import { cn } from "@/lib/utils";
import { hasLinkifiableUrl, LinkifiedText } from "@/lib/linkifyText";

type DescriptionInputProps = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  className?: string;
};

export default function DescriptionInput({
  value,
  onChange,
  rows = 4,
  className,
}: DescriptionInputProps) {
  const showPreview = value.trim().length > 0;

  return (
    <div
      className={cn(
        "w-full min-w-0 rounded-xl border-2 border-gray-200 bg-gray-50 text-sm text-gray-900 transition-colors focus-within:border-primary focus-within:bg-white",
        className,
      )}
    >
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        placeholder="Type notes here. Paste links on their own line — press Enter for new lines."
        className="block w-full min-w-0 px-3 py-2.5 bg-transparent border-0 outline-none resize-y whitespace-pre-wrap break-words !text-gray-900 !placeholder:text-gray-400"
      />
      {showPreview && (
        <div className="border-t border-gray-200 px-3 py-2.5 text-sm text-gray-700 whitespace-pre-wrap break-words">
          {hasLinkifiableUrl(value) ? (
            <>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 mb-1">
                Preview with links
              </p>
              <LinkifiedText text={value} />
            </>
          ) : (
            value
          )}
        </div>
      )}
    </div>
  );
}

function isLikelyUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^(?:https?:\/\/|www\.)/i.test(trimmed);
}

export function AddressUrlHint({ value }: { value: string }) {
  if (!isLikelyUrl(value)) return null;
  return (
    <p className="mt-1 text-xs text-amber-700">
      This looks like a web link. Paste links in <strong>Description</strong> instead of Job Address.
    </p>
  );
}
