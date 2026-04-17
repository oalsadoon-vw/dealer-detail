/**
 * Typed error classes for server-side authorization failures.
 *
 * The API route wrapper catches these and converts them to HTTP responses.
 * Server Components can also throw these; the (app) layout will catch and
 * redirect as appropriate.
 */

export class AppError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super(message, 401);
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Insufficient permissions") {
    super(message, 403);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found") {
    super(message, 404);
    this.name = "NotFoundError";
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
