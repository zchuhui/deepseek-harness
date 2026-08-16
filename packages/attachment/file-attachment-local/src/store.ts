/** Private content-addressed UTF-8 file storage. */

import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { chmod, link, mkdir, open, readFile, unlink } from 'node:fs/promises'
import { dirname, join, parse, resolve } from 'node:path'
import { FileAttachmentError, FileAttachmentId } from '@deepseek-ai/dsh-file-attachment'
import type { SaveTextFileAttachment, StoredTextFileAttachment, TextFileAttachmentLimits, TextFileAttachmentRef } from '@deepseek-ai/dsh-file-attachment'

const ID = /^sha256:([a-f0-9]{64})$/
const decoder = new TextDecoder('utf-8', { fatal: true })
const durableHomes = new Set<string>()

function digest(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function objectPath(root: string, sha256: string): string {
  return join(root, 'objects', sha256.slice(0, 2), sha256)
}
function displayName(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const leaf = value.slice(Math.max(value.lastIndexOf('/'), value.lastIndexOf('\\')) + 1)
  const clean = leaf.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 255)
  return clean === '' ? undefined : clean
}
function decode(data: Uint8Array): string {
  try {
    return decoder.decode(data)
  } catch (cause) {
    throw new FileAttachmentError('File is not valid UTF-8 text.', 'INVALID_FILE_ENCODING', { cause })
  }
}

function validate(input: SaveTextFileAttachment, limits: TextFileAttachmentLimits): void {
  if (input.data.byteLength === 0) throw new FileAttachmentError('File is empty.', 'INVALID_FILE')
  if (input.data.byteLength > limits.maxFileBytes) throw new FileAttachmentError('File exceeds the configured byte limit.', 'FILE_TOO_LARGE')
  if (!limits.mediaTypes.includes(input.mediaType)) throw new FileAttachmentError('File type is not allowed.', 'UNSUPPORTED_FILE_TYPE')
  if (input.data.includes(0)) throw new FileAttachmentError('File is not UTF-8 text.', 'INVALID_FILE_ENCODING')
  const text = decode(input.data)
  if (new TextEncoder().encode(text).byteLength > limits.maxDecodedTextBytes) throw new FileAttachmentError('Decoded file text exceeds the configured limit.', 'FILE_TEXT_TOO_LARGE')
}

/** Sync directory metadata after creating or linking a durable object. */
async function syncDirectory(path: string): Promise<void> {
  /* v8 ignore next -- Windows cannot open directory handles; NTFS journals metadata publication. */
  if (process.platform === 'win32') return
  /* v8 ignore start -- Windows cannot exercise directory fsync. */
  const handle = await open(path, constants.O_RDONLY)
  try {
    await handle.sync()
  } finally {
    await handle.close()
  }
  /* v8 ignore stop */
}

/** Create private directories and make their entries durable to a known ancestor. */
async function ensureDurableDirectory(path: string, boundary: string): Promise<void> {
  const target = resolve(path)
  const stop = resolve(boundary)
  await mkdir(target, { recursive: true, mode: 0o700 })
  await chmod(target, 0o700)
  let level = target
  while (level !== stop) {
    const parent = dirname(level)
    await syncDirectory(parent)
    /* v8 ignore next -- callers supply an ancestor boundary. */
    if (parent === level) return
    level = parent
  }
}

/** Establish that the local DSH home tree is durable for this process. */
async function ensureDurableHome(path: string): Promise<string> {
  const home = resolve(path)
  if (!durableHomes.has(home)) {
    await ensureDurableDirectory(home, parse(home).root)
    durableHomes.add(home)
  }
  return home
}

/** Validate one text file without creating storage. */
export async function validateTextFile(input: SaveTextFileAttachment, limits: TextFileAttachmentLimits): Promise<void> {
  validate(input, limits)
}

/** Save one admitted text file with atomic exclusive publication. */
export async function saveTextFile(
  root: string,
  input: SaveTextFileAttachment,
  limits: TextFileAttachmentLimits,
): Promise<TextFileAttachmentRef> {
  validate(input, limits)
  const sha256 = digest(input.data)
  const bucket = join(root, 'objects', sha256.slice(0, 2))
  const temporaryRoot = join(root, 'tmp')
  const target = objectPath(root, sha256)
  const boundary = await ensureDurableHome(dirname(dirname(resolve(root))))
  await ensureDurableDirectory(bucket, boundary)
  await ensureDurableDirectory(temporaryRoot, boundary)
  const temporary = join(temporaryRoot, randomUUID())
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600)
    await handle.writeFile(input.data)
    await handle.sync()
    await handle.close()
    handle = undefined
    try {
      await link(temporary, target)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error
      if (digest(new Uint8Array(await readFile(target))) !== sha256) throw new FileAttachmentError('Stored file failed integrity verification.', 'FILE_ATTACHMENT_CORRUPT')
    }
    await syncDirectory(bucket)
    await syncDirectory(join(root, 'objects'))
    await unlink(temporary)
  } catch (error) {
    if (handle !== undefined) {
      await handle.close().catch(
        /* v8 ignore next -- close failure cannot repair an already failed storage operation. */
        () => {},
      )
    }
    await unlink(temporary).catch(
      /* v8 ignore next -- cleanup only ignores an already removed staging file. */
      (cleanupError: unknown) => {
        if (!(cleanupError instanceof Error && 'code' in cleanupError && cleanupError.code === 'ENOENT')) throw cleanupError
      },
    )
    if (error instanceof FileAttachmentError) throw error
    throw new FileAttachmentError('Unable to persist file attachment.', 'FILE_ATTACHMENT_WRITE_FAILED', { cause: error })
  }
  const name = displayName(input.name)
  return { attachmentId: FileAttachmentId(`sha256:${sha256}`), mediaType: input.mediaType, bytes: input.data.byteLength, ...(name === undefined ? {} : { name }) }
}

/** Read and verify one text-file object. */
export async function readTextFile(root: string, ref: TextFileAttachmentRef, signal?: AbortSignal): Promise<StoredTextFileAttachment> {
  signal?.throwIfAborted()
  const sha256 = ID.exec(String(ref.attachmentId))?.[1]
  if (sha256 === undefined) throw new FileAttachmentError('File attachment reference is invalid.', 'INVALID_FILE_ATTACHMENT_REF')
  let data: Uint8Array
  try {
    data = new Uint8Array(await readFile(objectPath(root, sha256), { signal }))
  } catch (cause) {
    signal?.throwIfAborted()
    if (cause instanceof Error && 'code' in cause && cause.code === 'ENOENT') throw new FileAttachmentError('File attachment object is missing.', 'FILE_ATTACHMENT_NOT_FOUND')
    throw new FileAttachmentError('Unable to read file attachment.', 'FILE_ATTACHMENT_READ_FAILED', { cause })
  }
  signal?.throwIfAborted()
  if (digest(data) !== sha256 || data.byteLength !== ref.bytes || data.includes(0)) throw new FileAttachmentError('Stored file attachment failed integrity verification.', 'FILE_ATTACHMENT_CORRUPT')
  return { ref, data, text: decode(data) }
}
