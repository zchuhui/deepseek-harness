import { describe, expect, it } from 'vitest'
import {
  describeGrantRootWarnings,
  isFatFileSystem,
  isWideGrantRoot,
  readFileSystemType,
} from '@deepseek-ai/dsh-sandbox-windows-acl/src/grant-warnings.ts'

describe('grant-root warnings', () => {
  it('detects drive roots and well-known wide directories', () => {
    expect(isWideGrantRoot('C:\\')).toBe(true)
    expect(isWideGrantRoot('C:\\Users')).toBe(true)
    expect(isWideGrantRoot('C:\\Windows')).toBe(true)
    expect(isWideGrantRoot('C:\\Program Files')).toBe(true)
    expect(isWideGrantRoot('C:\\work\\repo')).toBe(false)
  })

  it('detects FAT-class volume names', () => {
    expect(isFatFileSystem('NTFS')).toBe(false)
    expect(isFatFileSystem('FAT32')).toBe(true)
    expect(isFatFileSystem('exFAT')).toBe(true)
    expect(isFatFileSystem(undefined)).toBe(false)
  })

  it('emits wide, FAT, and first-grant sentences', () => {
    const warnings = describeGrantRootWarnings('C:\\Users', 'FAT32', true)
    expect(warnings.map(warning => warning.kind)).toEqual(['wide-directory', 'fat-volume', 'first-grant-latency'])
    expect(warnings.every(warning => warning.message.length > 0)).toBe(true)
    expect(describeGrantRootWarnings('C:\\work\\repo')).toEqual([])
    expect(readFileSystemType('/definitely-missing-dsh-grant-root')).toBeUndefined()
    expect(readFileSystemType('C:\\work', () => ({ type: 'NTFS' }) as never)).toBe('NTFS')
    expect(readFileSystemType('C:\\work', () => ({ type: 1n }) as never)).toBeUndefined()
  })
})
