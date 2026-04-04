/** Standard CRUD routes for `User` under `/api/users`. */
import { Router } from "express";
import { createUser, deleteUser, getUserById, getUsers, updateUser } from "../controllers/user.controller";

export const userRouter = Router();

userRouter.post("/", createUser);
userRouter.get("/", getUsers);
userRouter.get("/:id", getUserById);
userRouter.patch("/:id", updateUser);
userRouter.delete("/:id", deleteUser);
