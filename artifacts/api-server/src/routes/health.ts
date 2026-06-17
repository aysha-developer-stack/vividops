import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/health", (req, res) => {
  console.log("Health check requested at /api/health");
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

export default router;
