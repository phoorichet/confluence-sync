export class ErrorMapper {
  public static mapError(error: any): { message: string; code?: string } {
    if (error instanceof Error) {
      return {
        message: error.message,
        code: error.message.match(/CS-\d+/)?.[0],
      };
    }

    return {
      message: String(error),
    };
  }

  public static sanitizeError(error: any): Error {
    const mapped = this.mapError(error);
    return new Error(mapped.message);
  }
}
