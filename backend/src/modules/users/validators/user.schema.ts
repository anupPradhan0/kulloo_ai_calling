/**
 * Zod schemas for user create, update, and id parameter validation used by user controllers before calling the service.
 * Keeps request validation out of Mongoose and Express so the same rules could be reused from scripts or tests.
 */

import { z } from "zod";

/** Validates Mongo ObjectId string in /api/users/:id routes. */
export const userIdParamSchema = z.object({
  id: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid user id"),
});

/** Body for POST /api/users with normalized lowercase email. */
export const createUserSchema = z.object({
  name: z.string().trim().min(1, "name is required"),
  email: z.string().trim().email("Invalid email address").transform((value) => value.toLowerCase()),
});

/** PATCH body requiring at least one of name or email. */
export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1, "name cannot be empty").optional(),
    email: z
      .string()
      .trim()
      .email("Invalid email address")
      .transform((value) => value.toLowerCase())
      .optional(),
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field is required to update",
  });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
