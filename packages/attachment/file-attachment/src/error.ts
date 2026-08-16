/** File-attachment failure class. @module @deepseek-ai/dsh-file-attachment/error */

/** Stable failures suitable for host RPC error mapping. */
export class FileAttachmentError extends Error {
  /** Stable machine-routing failure code. */
  readonly code: string

  /**
   * @param message - human-readable failure description without file bytes or host paths.
   * @param code - stable machine-routing code.
   * @param options - optional chained cause.
   */
  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'FileAttachmentError'
    this.code = code
  }
}
