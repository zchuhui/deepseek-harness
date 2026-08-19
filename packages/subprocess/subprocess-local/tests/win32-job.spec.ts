import { describe, expect, it } from 'vitest'
import { attachKillOnCloseJob } from '../src/win32-job.ts'
import type { Win32JobBindings } from '../src/win32-job.ts'

function ptr(value: bigint): Win32JobBindings extends never ? never : ReturnType<Win32JobBindings['createJobObjectW']> {
  return value as NonNullable<ReturnType<Win32JobBindings['createJobObjectW']>>
}

function fakeBindings(options: {
  create?: ReturnType<Win32JobBindings['createJobObjectW']>
  setInfo?: number
  openProcess?: ReturnType<Win32JobBindings['openProcess']>
  assign?: number
  active?: number
  queryFails?: boolean
} = {}): { api: Win32JobBindings; closed: bigint[]; terminated: bigint[] } {
  const closed: bigint[] = []
  const terminated: bigint[] = []
  const job = options.create === undefined ? ptr(0x10n) : options.create
  const process = options.openProcess === undefined ? ptr(0x20n) : options.openProcess
  const api: Win32JobBindings = {
    createJobObjectW: () => job,
    setInformationJobObject: () => options.setInfo ?? 1,
    assignProcessToJobObject: () => options.assign ?? 1,
    queryInformationJobObject: (_job, _cls, info) => {
      if (options.queryFails === true) return 0
      info.writeUInt32LE(options.active ?? 1, 40)
      return 1
    },
    terminateJobObject: (handle) => {
      terminated.push(handle as bigint)
      return 1
    },
    openProcess: () => process,
    closeHandle: (handle) => {
      closed.push(handle as bigint)
      return 1
    },
  }
  return { api, closed, terminated }
}

describe('attachKillOnCloseJob', () => {
  it('returns undefined for non-positive pids and missing bindings', () => {
    expect(attachKillOnCloseJob(-1, fakeBindings().api)).toBeUndefined()
    expect(attachKillOnCloseJob(0, fakeBindings().api)).toBeUndefined()
    expect(attachKillOnCloseJob(12, undefined)).toBeUndefined()
  })

  it('returns undefined when job creation, limit, open, or assign fails', () => {
    expect(attachKillOnCloseJob(12, fakeBindings({ create: null }).api)).toBeUndefined()
    expect(attachKillOnCloseJob(12, fakeBindings({ create: ptr(0n) }).api)).toBeUndefined()
    expect(attachKillOnCloseJob(12, fakeBindings({ setInfo: 0 }).api)).toBeUndefined()
    expect(attachKillOnCloseJob(12, fakeBindings({ openProcess: null }).api)).toBeUndefined()
    expect(attachKillOnCloseJob(12, fakeBindings({ assign: 0 }).api)).toBeUndefined()
  })

  it('reports liveness from ActiveProcesses and force-kills on terminate', () => {
    const { api, closed, terminated } = fakeBindings({ active: 2 })
    const job = attachKillOnCloseJob(44, api)
    expect(job?.queryAlive()).toBe(true)
    job?.terminate()
    expect(terminated).toEqual([0x10n])
    expect(closed).toContain(0x20n)
    expect(closed).toContain(0x10n)
    expect(job?.queryAlive()).toBe(false)
    job?.terminate()
    job?.close()
  })

  it('treats a query failure as not alive and close releases the handle', () => {
    const { api, closed, terminated } = fakeBindings({ queryFails: true })
    const job = attachKillOnCloseJob(44, api)
    expect(job?.queryAlive()).toBe(false)
    job?.close()
    expect(terminated).toEqual([])
    expect(closed).toContain(0x10n)
    expect(job?.queryAlive()).toBe(false)
  })
})
