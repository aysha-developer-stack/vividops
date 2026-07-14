import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import jobsRouter from "./jobs";
import attachmentsRouter from "./attachments";
import dashboardRouter from "./dashboard";
import postsRouter from "./posts";
import notificationsRouter from "./notifications";
import timeLogsRouter from "./time-logs";
import errorReportsRouter from "./error-reports";
import jobMembersRouter from "./job-members";
import checklistRouter from "./checklist";
import checklistTemplatesRouter from "./checklist-templates";
import cliqRouter from "./cliq";
import zohoRouter from "./zoho";
import settingsRouter from "./settings";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(jobsRouter);
router.use(attachmentsRouter);
router.use(dashboardRouter);
router.use(postsRouter);
router.use(notificationsRouter);
router.use(timeLogsRouter);
router.use(errorReportsRouter);
router.use(jobMembersRouter);
router.use(checklistRouter);
router.use(checklistTemplatesRouter);
router.use(cliqRouter);
router.use(zohoRouter);
router.use(settingsRouter);

export default router;
