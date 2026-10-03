/** Thrown when the user has not supplied something Alfred needs to proceed. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
