/** Durable UTF-8 file attachment storage seam (`ctx.fileAttachments`). @module @deepseek-ai/dsh-file-attachment */

import { Context, Service } from '@deepseek-ai/cordis'
import type {
  SaveTextFileAttachment,
  StoredTextFileAttachment,
  TextFileAttachmentLimits,
  TextFileAttachmentRef,
} from './types.ts'

export { FileAttachmentId } from './brand.ts'
export { FileAttachmentError } from './error.ts'
export type {
  FileAttachmentId as FileAttachmentIdType,
  SaveTextFileAttachment,
  StoredTextFileAttachment,
  TextFileAttachmentLimits,
  TextFileAttachmentRef,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    fileAttachments: FileAttachmentStore
  }
}

/** Immutable UTF-8 text-file attachment service. Implementations validate bytes before publishing a reference. */
export abstract class FileAttachmentStore extends Service {
  constructor(ctx: Context) {
    super(ctx, 'fileAttachments')
  }

  /** Deployment-resolved file policy used by authoritative and fast-path validation. */
  abstract readonly textFileLimits: TextFileAttachmentLimits

  /**
   * Validate one UTF-8 text file without persisting it.
   * Batch callers validate every member before saving any member.
   * @param input - encoded bytes, declared media type, and optional display name.
   * @returns completion after UTF-8 and media policy validation.
   */
  abstract validateTextFile(input: SaveTextFileAttachment): Promise<void>

  /**
   * Validate and durably commit one text file before its owning session event is appended.
   * @param input - encoded bytes, declared media type, and optional display name.
   * @returns a durable content-addressed reference.
   */
  abstract saveTextFile(input: SaveTextFileAttachment): Promise<TextFileAttachmentRef>

  /**
   * Read one text file and verify that bytes and UTF-8 text still match the recorded reference.
   * @param ref - durable reference from the session log.
   * @param signal - optional cancellation for backend read and verification work.
   * @returns the verified bytes, decoded text, and canonical reference.
   * @throws the signal reason when aborted, or a storage error when verification fails.
   */
  abstract readTextFile(ref: TextFileAttachmentRef, signal?: AbortSignal): Promise<StoredTextFileAttachment>
}

export default FileAttachmentStore
