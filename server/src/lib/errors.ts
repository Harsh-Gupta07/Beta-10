/** An error whose message is safe to show to the user, with the HTTP status to respond with. */
export class AppError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message)
    this.name = 'AppError'
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found.`)
