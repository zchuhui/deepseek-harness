import { createHash } from 'node:crypto'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp, rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import type { TextFileAttachmentLimits } from '@deepseek-ai/dsh-file-attachment'
import { readTextFile, saveTextFile } from '../src/store.ts'

const LIMITS: TextFileAttachmentLimits = {
  maxFileBytes: 32,
  maxFilesPerMessage: 2,
  maxMessageFileBytes: 64,
  maxDecodedTextBytes: 32,
  mediaTypes: ['text/plain', 'text/markdown'],
}

const roots: string[] = []

async function root(): Promise<string> {
  const value = await mkdtemp(join(tmpdir(), 'dsh-file-attachment-'))
  roots.push(value)
  return join(value, 'file-attachments', 'v1')
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('local text-file attachment store', () => {
  it('publishes an immutable content-addressed UTF-8 file without its source path', async () => {
    const storageRoot = await root()
    const data = new TextEncoder().encode('# Notes\nhello\n')
    const ref = await saveTextFile(storageRoot, {
      data,
      mediaType: 'text/markdown',
      name: 'C:\\private\\notes.md',
    }, LIMITS)
    const sha256 = createHash('sha256').update(data).digest('hex')
    const object = join(storageRoot, 'objects', sha256.slice(0, 2), sha256)

    expect(ref).toEqual({
      attachmentId: `sha256:${sha256}`,
      mediaType: 'text/markdown',
      bytes: data.byteLength,
      name: 'notes.md',
    })
    expect(new Uint8Array(await readFile(object))).toEqual(data)
    await expect(readTextFile(storageRoot, ref)).resolves.toEqual({ ref, data, text: '# Notes\nhello\n' })
  })

  it('deduplicates equal bytes and rejects unsupported, malformed, and oversized files', async () => {
    const storageRoot = await root()
    const data = new TextEncoder().encode('same')
    const first = await saveTextFile(storageRoot, { data, mediaType: 'text/plain' }, LIMITS)
    const second = await saveTextFile(storageRoot, { data, mediaType: 'text/plain' }, LIMITS)

    expect(second.attachmentId).toBe(first.attachmentId)
    await expect(saveTextFile(storageRoot, { data, mediaType: 'application/pdf' }, LIMITS))
      .rejects.toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' })
    await expect(saveTextFile(storageRoot, { data: Uint8Array.of(0), mediaType: 'text/plain' }, LIMITS))
      .rejects.toMatchObject({ code: 'INVALID_FILE_ENCODING' })
    await expect(saveTextFile(storageRoot, { data: new Uint8Array(33), mediaType: 'text/plain' }, LIMITS))
      .rejects.toMatchObject({ code: 'FILE_TOO_LARGE' })
  })

  it('fails closed for missing, corrupt, and invalid durable references', async () => {
    const storageRoot = await root()
    const data = new TextEncoder().encode('safe text')
    const ref = await saveTextFile(storageRoot, { data, mediaType: 'text/plain' }, LIMITS)
    const sha256 = String(ref.attachmentId).slice('sha256:'.length)
    const object = join(storageRoot, 'objects', sha256.slice(0, 2), sha256)

    await chmod(object, 0o600)
    await writeFile(object, 'changed')
    await expect(readTextFile(storageRoot, ref)).rejects.toMatchObject({ code: 'FILE_ATTACHMENT_CORRUPT' })
    await expect(readTextFile(storageRoot, { ...ref, attachmentId: 'bad' as never }))
      .rejects.toMatchObject({ code: 'INVALID_FILE_ATTACHMENT_REF' })

    const missingRoot = await root()
    await mkdir(missingRoot, { recursive: true })
    await expect(readTextFile(missingRoot, ref)).rejects.toMatchObject({ code: 'FILE_ATTACHMENT_NOT_FOUND' })
  })
})
