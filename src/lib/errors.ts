/** Thrown when the user has not supplied something Alfred needs to proceed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/** Thrown when something the user supplied is unusable — a bad upload, say. */
export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InputError";
  }
}

/**
 * Thrown when a prep item cannot be completed because the work behind it has
 * not been done. The whole point of exercises is that this path exists: "done"
 * is a consequence of a passing submission, never a thing you can assert.
 */
export class NotEarnedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotEarnedError";
  }
}
