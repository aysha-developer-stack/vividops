import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import { TIMER_AUTO_STOP_S } from "@/lib/timerNotifications";

export default function TimerActivityPing({
  open,
  countdown,
  jobLabel,
  onContinue,
  onStop,
}: {
  open: boolean;
  countdown: number;
  jobLabel?: string;
  onContinue: () => void;
  onStop: () => void;
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="fixed bottom-6 right-6 bg-white border border-gray-200 rounded-2xl shadow-2xl p-5 max-w-sm z-50"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <div className="font-bold text-gray-900 text-sm">Still working?</div>
                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
                  Auto-stop in {countdown}s
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {jobLabel
                  ? `Timer on ${jobLabel} has been running for 1 hour.`
                  : "Your timer has been running for 1 hour."}{" "}
                We&apos;ll auto-stop and save the log if you don&apos;t respond.
              </p>
              <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-2">
                <motion.div
                  key={countdown}
                  className="h-full bg-red-500"
                  initial={{ width: "100%" }}
                  animate={{ width: `${(countdown / TIMER_AUTO_STOP_S) * 100}%` }}
                  transition={{ duration: 1, ease: "linear" }}
                />
              </div>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={onContinue}
                  className="flex-1 py-1.5 bg-primary text-white rounded-lg text-xs font-bold hover:bg-primary/90"
                >
                  Yes, continue
                </button>
                <button
                  type="button"
                  onClick={onStop}
                  className="flex-1 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-xs font-bold hover:bg-gray-200"
                >
                  Stop &amp; save
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
