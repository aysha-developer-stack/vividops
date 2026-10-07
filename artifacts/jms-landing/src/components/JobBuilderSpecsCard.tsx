import { useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { LinkifiedText } from "@/lib/linkifyText";
import { fetchJobBuilderSpecs } from "@/lib/builderSpecsApi";

type Props = {
  jobId: string;
  clientName?: string | null;
};

export default function JobBuilderSpecsCard({ jobId, clientName }: Props) {
  const [body, setBody] = useState<string | null>(null);
  const [builderName, setBuilderName] = useState(clientName?.trim() || "");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    (async () => {
      try {
        const data = await fetchJobBuilderSpecs(jobId);
        if (cancelled) return;
        setBuilderName(data.builderName?.trim() || clientName?.trim() || "");
        setBody(data.body?.trim() ? data.body : null);
      } catch {
        if (!cancelled) setBody(null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [jobId, clientName]);

  if (!loaded || !body) return null;

  return (
    <section className="mb-6 rounded-2xl border border-sky-100 bg-sky-50/70 p-5">
      <div className="mb-2 flex items-center gap-2 text-sky-900">
        <ScrollText size={16} className="shrink-0" />
        <h3 className="text-sm font-bold">
          Builder specs
          {builderName ? <span className="font-semibold text-sky-800"> · {builderName}</span> : null}
        </h3>
      </div>
      <p className="mb-3 text-xs text-sky-800/80">
        Follow these requirements for this builder. They were copied onto this job when it was assigned.
      </p>
      <div className="max-h-64 overflow-y-auto rounded-xl border border-sky-100 bg-white p-4 text-sm leading-relaxed text-gray-800 whitespace-pre-wrap">
        <LinkifiedText text={body} />
      </div>
    </section>
  );
}
