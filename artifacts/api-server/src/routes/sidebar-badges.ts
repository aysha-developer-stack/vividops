import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import {
  getSidebarBadgeCounts,
  isSidebarSection,
  markSectionSeen,
} from "../lib/sidebar-badges";

const router: IRouter = Router();

router.get("/sidebar-badge-counts", requireAuth, async (req, res) => {
  try {
    const counts = await getSidebarBadgeCounts(req.session!.user);
    return res.json(counts);
  } catch (err) {
    logger.error({ err }, "Failed to load sidebar badge counts");
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/sidebar-badge-counts/:section/mark-seen", requireAuth, async (req, res) => {
  try {
    const section = String(req.params.section ?? "");
    if (!isSidebarSection(section) || section === "communication") {
      return res.status(400).json({ error: "Invalid section" });
    }
    await markSectionSeen(req.session!.user.id, section);
    const counts = await getSidebarBadgeCounts(req.session!.user);
    return res.json(counts);
  } catch (err) {
    logger.error({ err }, "Failed to mark sidebar section seen");
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
