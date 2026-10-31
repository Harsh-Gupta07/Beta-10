/**
 * An error whose message is safe to show to the user, with the HTTP status to respond with.
 * `code` is a stable machine-readable reason for clients that need to react to a specific case.
 */
export class AppError extends Error {
  constructor(public readonly status: number, message: string, public readonly code?: string) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found.`)
