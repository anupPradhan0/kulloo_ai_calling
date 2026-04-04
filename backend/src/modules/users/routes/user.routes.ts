/**
 * Registers REST endpoints for creating, listing, reading, updating, and deleting users under /api/users.
 */

/** Layer: routing only — connects HTTP paths and verbs to user controller exports. */
import { Router } from "express";
import { createUser, deleteUser, getUserById, getUsers, updateUser } from "../controllers/user.controller";

export const userRouter = Router();

userRouter.post("/", createUser);
userRouter.get("/", getUsers);
userRouter.get("/:id", getUserById);
userRouter.patch("/:id", updateUser);
userRouter.delete("/:id", deleteUser);
