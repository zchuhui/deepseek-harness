/** Local UTF-8 file attachment backend. @module @deepseek-ai/dsh-file-attachment-local */

import { join, resolve } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import FileAttachmentStore from '@deepseek-ai/dsh-file-attachment'
import type { SaveTextFileAttachment, StoredTextFileAttachment, TextFileAttachmentLimits, TextFileAttachmentRef } from '@deepseek-ai/dsh-file-attachment'
import { resolveDshHome } from '@deepseek-ai/dsh-home-paths'
import { readTextFile, saveTextFile, validateTextFile } from './store.ts'

export { readTextFile, saveTextFile, validateTextFile } from './store.ts'

/** Configuration for the local text-file store. */
export interface Config {
  /** Optional Harness home override; objects live below `file-attachments/v1`. */
  dshHome?: string
  /** Maximum encoded bytes accepted for one source file. */
  maxFileBytes?: number
  /** Maximum text files one prompt may carry. */
  maxFilesPerMessage?: number
  /** Maximum combined encoded bytes for all text files in one prompt. */
  maxMessageFileBytes?: number
  /** Maximum decoded UTF-8 bytes accepted for one source file. */
  maxDecodedTextBytes?: number
  /** IANA media types eligible for durable UTF-8 text admission. */
  mediaTypes?: string[]
}
export const DEFAULT_MAX_FILE_BYTES = 512 * 1024
export const DEFAULT_MAX_FILES_PER_MESSAGE = 10
export const DEFAULT_MAX_MESSAGE_FILE_BYTES = 2 * 1024 * 1024
export const DEFAULT_MAX_DECODED_TEXT_BYTES = 2 * 1024 * 1024
export const DEFAULT_MEDIA_TYPES = ['text/plain', 'text/markdown', 'application/json', 'application/yaml', 'text/yaml']

/** Persistent content-addressed local file store. */
export class LocalFileAttachmentStore extends FileAttachmentStore {
  static Config: z<Config> = z.object({
    dshHome: z.string(),
    maxFileBytes: z.number().step(1).min(1).default(DEFAULT_MAX_FILE_BYTES),
    maxFilesPerMessage: z.number().step(1).min(1).default(DEFAULT_MAX_FILES_PER_MESSAGE),
    maxMessageFileBytes: z.number().step(1).min(1).default(DEFAULT_MAX_MESSAGE_FILE_BYTES),
    maxDecodedTextBytes: z.number().step(1).min(1).default(DEFAULT_MAX_DECODED_TEXT_BYTES),
    mediaTypes: z.array(z.string()).default(DEFAULT_MEDIA_TYPES),
  })
  readonly root: string
  readonly textFileLimits: TextFileAttachmentLimits
  constructor(ctx: Context, config: Config) {
    super(ctx)
    this.root = resolve(join(resolveDshHome(config.dshHome), 'file-attachments', 'v1'))
    this.textFileLimits = Object.freeze({
      maxFileBytes: config.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
      maxFilesPerMessage: config.maxFilesPerMessage ?? DEFAULT_MAX_FILES_PER_MESSAGE,
      maxMessageFileBytes: config.maxMessageFileBytes ?? DEFAULT_MAX_MESSAGE_FILE_BYTES,
      maxDecodedTextBytes: config.maxDecodedTextBytes ?? DEFAULT_MAX_DECODED_TEXT_BYTES,
      mediaTypes: Object.freeze(config.mediaTypes ?? DEFAULT_MEDIA_TYPES),
    })
  }

  validateTextFile(input: SaveTextFileAttachment): Promise<void> {
    return validateTextFile(input, this.textFileLimits)
  }

  saveTextFile(input: SaveTextFileAttachment): Promise<TextFileAttachmentRef> {
    return saveTextFile(this.root, input, this.textFileLimits)
  }

  readTextFile(ref: TextFileAttachmentRef, signal?: AbortSignal): Promise<StoredTextFileAttachment> {
    return readTextFile(this.root, ref, signal)
  }
}

export default LocalFileAttachmentStore
