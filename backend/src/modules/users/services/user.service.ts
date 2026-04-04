/**
 * Implements user domain rules such as unique email enforcement and not-found handling for CRUD operations.
 * Controllers delegate here; this class uses UserRepository only for database access.
 */

/** Layer: business logic — orchestrates repositories; throws ApiError for expected client mistakes. */
import { ApiError } from "../../../utils/api-error";
import { UserRepository } from "../repositories/user.repository";
import { UserDocument } from "../models/user.model";

export class UserService {
  private readonly userRepository = new UserRepository();

  /**
   * Creates a user after verifying the email is not already taken.
   * @param payload Name and email from a validated request body.
   * @returns The persisted user document.
   */
  async createUser(payload: Pick<UserDocument, "name" | "email">): Promise<UserDocument> {
    const existingUser = await this.userRepository.findByEmail(payload.email);
    if (existingUser) {
      throw new ApiError("Email already exists", 409);
    }

    return this.userRepository.create(payload);
  }

  /**
   * Returns all users for listing endpoints.
   */
  async getUsers(): Promise<UserDocument[]> {
    return this.userRepository.findAll();
  }

  /**
   * Fetches a single user or throws 404 when missing or invalid id at the repository layer.
   */
  async getUserById(id: string): Promise<UserDocument> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    return user;
  }

  /**
   * Applies partial updates and throws when the target user does not exist.
   */
  async updateUser(
    id: string,
    payload: Partial<Pick<UserDocument, "name" | "email">>,
  ): Promise<UserDocument> {
    const user = await this.userRepository.updateById(id, payload);

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    return user;
  }

  /**
   * Deletes a user or throws 404 when no row matched the id.
   */
  async deleteUser(id: string): Promise<void> {
    const user = await this.userRepository.deleteById(id);

    if (!user) {
      throw new ApiError("User not found", 404);
    }
  }
}
