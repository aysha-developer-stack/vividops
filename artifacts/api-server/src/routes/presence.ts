import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { markOpsInteraction } from "../lib/presence";
import { ensureOpenFreeTime } from "../lib/free-time-tracking";

const router: IRouter = Router();

/** Click or key in OPS — not polling. Starts/keeps idle free time. */
router.post("/presence/activity", requireAuth, async (req, res) => {
  const actor = req.session!.user;
  try {
    await markOpsInteraction(actor.id);
    if (actor.role === "user") {
      await ensureOpenFreeTime(actor.id);
    }
  } catch {
    // Presence ping must not fail the UI.
  }
  return res.json({ ok: true });
});

export default router;
