/**
 * Creates the Express application with security and parsing middleware, Plivo XML routes on the root app, and JSON API under /api.
 * This module does not call listen; server.ts imports the app, starts background services, then binds the HTTP port.
 */

import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { correlationIdMiddleware } from "./middlewares/correlation.middleware";
import { registerPlivoWebhookRoutes } from "./modules/calls/routes/plivo.webhooks";
import { listAllRecordings } from "./modules/calls/controllers/call.controller";
import { env } from "./config/env";

/** Fully configured Express instance (not yet listening on a port). */
export const app = express();

app.set("trust proxy", 1);
app.set("etag", false);

// Skip all Express middleware for WebSocket upgrade requests.
// The ws library handles these at the http.Server level (see server.ts).
// Without this, Express middleware runs and eventually sends HTTP responses
// on the upgraded socket, causing "Invalid frame header" errors in browsers.
app.use((req, res, next) => {
  if (req.headers.upgrade?.toLowerCase() === "websocket") {
    // Don't process WebSocket upgrades through Express at all.
    // The ws library will handle the upgrade event on the http.Server.
    return;
  }
  next();
});

app.use(cors());
app.use(helmet());

morgan.token("correlation-id", (req: express.Request) => req.correlationId ?? "-");
if (env.nodeEnv === "production") {
  app.use(
    morgan(
      ':correlation-id :remote-addr :method :url HTTP/:http-version :status :res[content-length] - :response-time ms',
    ),
  );
} else {
  app.use(morgan(":correlation-id :method :url :status :response-time ms"));
}
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(correlationIdMiddleware);

registerPlivoWebhookRoutes(app);

/** List-recordings must be registered on `app` so it is not lost inside nested `Router` matching for `/recordings`. */
app.get("/api/recordings", listAllRecordings);
app.get("/api/recordings/", listAllRecordings);

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
