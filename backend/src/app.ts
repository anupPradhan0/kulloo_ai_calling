import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";

export const app = express();

app.set("trust proxy", 1);
app.set("etag", false);

app.use(cors());
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function getPublicBaseUrl(req: express.Request): string {
  const explicit = process.env.PUBLIC_BASE_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const proto = req.protocol;
  const host = req.get("host");
  return `${proto}://${host}`;
}

function sendPlivoAnswerXml(req: express.Request, res: express.Response): void {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");

  const callUuid = (req.method === "GET" ? req.query.CallUUID : req.body?.CallUUID) as string | undefined;
  const baseUrl = getPublicBaseUrl(req);
  const freeswitchSipUri = process.env.FREESWITCH_SIP_URI?.trim();

  if (!freeswitchSipUri) {
    res.type("application/xml").status(200).send(
      `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>FreeSWITCH SIP URI is not configured.</Speak>
  <Hangup />
</Response>`,
    );
    return;
  }

  // Route the call to our media plane (FreeSWITCH). Recording happens there (Kulloo-owned).
  res.type("application/xml").status(200).send(
    `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <User>${freeswitchSipUri}</User>
  </Dial>
</Response>`,
  );
}

app.get("/plivo/answer", (req, res) => {
  sendPlivoAnswerXml(req, res);
});

app.post("/plivo/answer", (req, res) => {
  // Plivo may POST call status events to the same URL; we still respond with XML to be safe.
  sendPlivoAnswerXml(req, res);
});

app.post("/plivo/hangup", (_req, res) => {
  // Endpoint reserved for Plivo hangup_url in call create.
  res.status(200).json({ success: true });
});

app.use("/api", apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
