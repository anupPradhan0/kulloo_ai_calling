/**
 * Defines an HTTP-style error type that the central error middleware turns into a JSON response with a status code.
 * Use this instead of throwing plain Error when the client should receive a specific status (for example 404 or 409).
 * Controllers and services throw ApiError; middleware maps it to the response body.
 */

/** Layer: shared error type — carries a message and HTTP status for the global error handler. */
export class ApiError extends Error {
  public readonly statusCode: number;

  /**
   * Builds an error that downstream code can recognize and convert to an HTTP response.
   * @param message Human-readable message returned to the client in the JSON body.
   * @param statusCode HTTP status to send (defaults to 500 when omitted).
   */
  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}
