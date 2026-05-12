export class AppError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
  }
}

export function getErrorMessage(error: unknown, fallback = "予期しないエラーが発生しました。") {
  if (error instanceof AppError) {
    return error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export function getErrorStatus(error: unknown, fallback = 500) {
  if (error instanceof AppError) {
    return error.status;
  }

  return fallback;
}
