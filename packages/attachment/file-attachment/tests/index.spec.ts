import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import FileAttachmentStore, { FileAttachmentError, FileAttachmentId } from '../src/index.ts'
import type {
  SaveTextFileAttachment,
  StoredTextFileAttachment,
  TextFileAttachmentLimits,
  TextFileAttachmentRef,
} from '../src/index.ts'

class TestStore extends FileAttachmentStore {
  readonly textFileLimits: TextFileAttachmentLimits = {
    maxFileBytes: 1,
    maxFilesPerMessage: 1,
    maxMessageFileBytes: 1,
    maxDecodedTextBytes: 1,
    mediaTypes: ['text/plain'],
  }

  validateTextFile(_input: SaveTextFileAttachment): Promise<void> { return Promise.resolve() }
  saveTextFile(_input: SaveTextFileAttachment): Promise<TextFileAttachmentRef> {
    return Promise.resolve({ attachmentId: FileAttachmentId('test'), mediaType: 'text/plain', bytes: 1 })
  }
  readTextFile(ref: TextFileAttachmentRef): Promise<StoredTextFileAttachment> {
    return Promise.resolve({ ref, data: Uint8Array.of(1), text: 'x' })
  }
}

describe('FileAttachmentStore', () => {
  it('registers the file-attachment service key and keeps stable error codes', async () => {
    const ctx = new Context()
    const store = new TestStore(ctx)
    expect(ctx.get('fileAttachments')).toBeDefined()
    await expect(store.readTextFile(await store.saveTextFile({ data: Uint8Array.of(1), mediaType: 'text/plain' })))
      .resolves.toMatchObject({ text: 'x' })
    expect(new FileAttachmentError('failed', 'FILE_READ_FAILED')).toMatchObject({ code: 'FILE_READ_FAILED' })
  })
})
