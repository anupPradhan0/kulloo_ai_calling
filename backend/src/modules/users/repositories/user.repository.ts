/**
 * Encapsulates all Mongoose access for the User collection so services never import UserModel directly.
 * Each method returns documents or null and leaves HTTP status decisions to the service layer.
 */

/** Layer: database only — Mongoose queries; no business rules or Express types. */
import { Types } from "mongoose";
import { UserDocument, UserModel } from "../models/user.model";

export class UserRepository {
  /**
   * Inserts a new user row with the given name and email.
   */
  async create(payload: Pick<UserDocument, "name" | "email">): Promise<UserDocument> {
    return UserModel.create(payload);
  }

  /**
   * Lists every user newest-first for the admin-style GET /api/users endpoint.
   */
  async findAll(): Promise<UserDocument[]> {
    return UserModel.find().sort({ createdAt: -1 });
  }

  /**
   * Case-insensitive lookup by normalized email stored in Mongo.
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() });
  }

  /**
   * Fetches one user by Mongo id string; returns null when the id format is invalid or no row exists.
   */
  async findById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return UserModel.findById(id);
  }

  /**
   * Partial update by id; returns the updated document or null when id is invalid or missing.
   */
  async updateById(
    id: string,
    payload: Partial<Pick<UserDocument, "name" | "email">>,
  ): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return UserModel.findByIdAndUpdate(id, payload, { new: true, runValidators: true });
  }

  /**
   * Deletes by id and returns the removed document so the service can tell 404 from success.
   */
  async deleteById(id: string): Promise<UserDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }

    return UserModel.findByIdAndDelete(id);
  }
}
