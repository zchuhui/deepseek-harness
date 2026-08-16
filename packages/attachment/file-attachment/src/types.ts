/** Durable text-file attachment vocabulary. @module @deepseek-ai/dsh-file-attachment/types */

import type { FileAttachmentId } from './brand.ts'

export type { FileAttachmentId } from './brand.ts'

/** Durable, serializable metadata for one immutable UTF-8 file object. */
export interface TextFileAttachmentRef {
  /** Opaque storage identifier; never a filesystem path or bearer URL. */
  attachmentId: FileAttachmentId
  /** Declared media type accepted by the deployment policy. */
  mediaType: string
  /** Exact encoded UTF-8 byte length. */
  bytes: number
  /** Optional display name stripped of local path information. */
  name?: string
}

/** Deployment-resolved limits used by host file admission. */
export interface TextFileAttachmentLimits {
  maxFileBytes: number
  maxFilesPerMessage: number
  maxMessageFileBytes: number
  maxDecodedTextBytes: number
  mediaTypes: readonly string[]
}

/** Request to validate and durably commit one UTF-8 text file. */
export interface SaveTextFileAttachment {
  data: Uint8Array
  /** Caller-declared media type, checked against deployment policy. */
  mediaType: string
  /** Optional host-selected display name; it is never interpreted as a path. */
  name?: string
}

/** Verified file bytes and decoded text returned for model conversion. */
export interface StoredTextFileAttachment {
  ref: TextFileAttachmentRef
  data: Uint8Array
  text: string
}
