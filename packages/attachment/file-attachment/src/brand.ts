/** File-attachment identifier brand. @module @deepseek-ai/dsh-file-attachment/brand */

import type { Branded } from '@deepseek-ai/dsh-brand'

/** Opaque content-addressed identifier for one immutable text-file object. */
export type FileAttachmentId = Branded<'FileAttachmentId'>

/**
 * Brand a validated storage identifier.
 * @param value - backend-produced opaque identifier.
 * @returns the branded identifier.
 */
export function FileAttachmentId(value: string): FileAttachmentId {
  return value as FileAttachmentId
}
