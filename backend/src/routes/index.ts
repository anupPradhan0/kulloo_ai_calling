import { Router } from "express";
import { healthRouter } from "./health.routes";
import { userRouter } from "./user.routes";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);
apiRouter.use("/users", userRouter);
