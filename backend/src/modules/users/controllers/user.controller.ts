/**
 * Express handlers for the users REST API: parse input with Zod, invoke UserService, and forward errors to middleware.
 * Each handler stays thin so policy and database work remain in the service and repository layers.
 */

/** Layer: HTTP only — validate input, call service, set status and JSON body; no business rules here. */
import { NextFunction, Request, Response } from "express";
import { UserService } from "../services/user.service";
import { parseWithSchema } from "../../../utils/zod-validate";
import { createUserSchema, updateUserSchema, userIdParamSchema } from "../validators/user.schema";

const userService = new UserService();

/**
 * POST /api/users — creates a user from JSON body after schema validation.
 */
export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = parseWithSchema(createUserSchema, req.body);
    const user = await userService.createUser(payload);

    res.status(201).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users — returns every user document for simple admin or demo use.
 */
export async function getUsers(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const users = await userService.getUsers();
    res.status(200).json({ success: true, data: users });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/users/:id — fetches one user by Mongo id from route params.
 */
export async function getUserById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = parseWithSchema(userIdParamSchema, req.params);
    const user = await userService.getUserById(id);
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/users/:id — applies partial updates from JSON body.
 */
export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = parseWithSchema(userIdParamSchema, req.params);
    const payload = parseWithSchema(updateUserSchema, req.body);
    const user = await userService.updateUser(id, payload);
    res.status(200).json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/users/:id — removes the user and responds with 204 on success.
 */
export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { id } = parseWithSchema(userIdParamSchema, req.params);
    await userService.deleteUser(id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
