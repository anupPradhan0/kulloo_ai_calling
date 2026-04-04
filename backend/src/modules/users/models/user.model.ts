/**
 * Defines the User document shape and Mongoose schema for simple name and email storage used by the users API.
 * Email is stored lowercase with a unique index so lookups and duplicate detection stay consistent.
 */

/** Layer: persistence shape only — schema and types; validation rules for HTTP live in Zod. */
import { model, Schema } from "mongoose";

/** Fields persisted for each user record. */
export interface UserDocument {
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDocument>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
  },
  { timestamps: true },
);

/** Mongoose model backing UserRepository. */
export const UserModel = model<UserDocument>("User", userSchema);
