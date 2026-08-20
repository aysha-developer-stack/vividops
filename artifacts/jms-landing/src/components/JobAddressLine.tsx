import { MapPin } from "lucide-react";

export function formatJobAddress(address: string | null | undefined, fallback = "No address"): string {
  const trimmed = (address ?? "").trim();
  return trimmed || fallback;
}

interface JobAddressLineProps {
  address?: string | null;
  fallback?: string;
  className?: string;
  iconSize?: number;
}

export default function JobAddressLine({
  address,
  fallback = "No address",
  className = "text-xs text-gray-500 mt-0.5 flex items-center gap-1 min-w-0",
  iconSize = 12,
}: JobAddressLineProps) {
  const text = formatJobAddress(address, fallback);
  return (
    <div className={className} title={text}>
      <MapPin size={iconSize} className="shrink-0" />
      <span className="truncate">{text}</span>
    </div>
  );
}
