import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { attachSession } from "./middlewares/session";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(attachSession);

app.use("/api", router);

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  logger.error({ err, url: req.url, method: req.method }, "Unhandled error");
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: "Internal Server Error",
  });
});

export default app;
