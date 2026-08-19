/**
 * Kill-on-close Job Object attachment for ordinary local Windows spawns.
 * Bindings load only on win32; tests inject the kernel table.
 * @module dsh-subprocess-local/win32-job
 */

import koffi from 'koffi'

/** Branded koffi 3 native pointer. */
declare const nativePtr: unique symbol
/** Koffi 3 native pointer (a BigInt address), branded so it cannot silently enter numeric contexts. */
type NativePtr = bigint & { readonly [nativePtr]: true }

const PROCESS_TERMINATE = 0x0001
const PROCESS_SET_QUOTA = 0x0100
const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x00002000
const JobObjectExtendedLimitInformation = 9
const JobObjectBasicAccountingInformation = 1
const JOBOBJECT_EXTENDED_LIMIT_SIZE = 144
const JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET = 16
const JOBOBJECT_BASIC_ACCOUNTING_SIZE = 48
const JOBOBJECT_ACTIVE_PROCESSES_OFFSET = 40

/** Kernel32 operations required to own one kill-on-close job. */
export interface Win32JobBindings {
  createJobObjectW(attributes: null, name: null): NativePtr | null
  setInformationJobObject(job: NativePtr, cls: number, info: Buffer, length: number): number
  assignProcessToJobObject(job: NativePtr, process: NativePtr): number
  queryInformationJobObject(
    job: NativePtr,
    cls: number,
    info: Buffer,
    length: number,
    returned: Buffer | null,
  ): number
  terminateJobObject(job: NativePtr, exitCode: number): number
  openProcess(desiredAccess: number, inheritHandle: number, pid: number): NativePtr | null
  closeHandle(handle: NativePtr): number
}

/** One assigned Job Object: liveness follows the job, not the direct child. */
export interface Win32Job {
  /** Whether the job still has an executing member. */
  queryAlive(): boolean
  /** Force-terminate every member, then release the handle. */
  terminate(): void
  /** Close the handle; kill-on-close ends remaining members. */
  close(): void
}

function isNullPtr(value: NativePtr | null | undefined): value is null | undefined {
  return value === null || value === undefined || (value as bigint) === 0n
}

/* v8 ignore start -- kernel32 load; injected bindings cover the job state machine. */
function loadWin32JobBindings(): Win32JobBindings | undefined {
  if (process.platform !== 'win32') return undefined
  const kernel32 = koffi.load('kernel32.dll')
  const PVOID = koffi.pointer('void')
  type Spec = ReturnType<typeof koffi.pointer> | string
  const bind = <T>(name: string, result: Spec, args: Spec[]): T =>
    kernel32.func(name, result, args) as T
  return {
    createJobObjectW: bind('CreateJobObjectW', PVOID, [PVOID, 'str16']),
    setInformationJobObject: bind('SetInformationJobObject', 'int', [PVOID, 'int', PVOID, 'uint32']),
    assignProcessToJobObject: bind('AssignProcessToJobObject', 'int', [PVOID, PVOID]),
    queryInformationJobObject: bind('QueryInformationJobObject', 'int', [PVOID, 'int', PVOID, 'uint32', PVOID]),
    terminateJobObject: bind('TerminateJobObject', 'int', [PVOID, 'uint32']),
    openProcess: bind('OpenProcess', PVOID, ['uint32', 'int', 'uint32']),
    closeHandle: bind('CloseHandle', 'int', [PVOID]),
  }
}
/* v8 ignore stop */

class LocalWin32Job implements Win32Job {
  constructor(
    private readonly api: Win32JobBindings,
    private handle: NativePtr | undefined,
  ) {}

  queryAlive(): boolean {
    if (this.handle === undefined) return false
    const info = Buffer.alloc(JOBOBJECT_BASIC_ACCOUNTING_SIZE)
    if (this.api.queryInformationJobObject(
      this.handle,
      JobObjectBasicAccountingInformation,
      info,
      info.length,
      null,
    ) === 0) {
      return false
    }
    return info.readUInt32LE(JOBOBJECT_ACTIVE_PROCESSES_OFFSET) > 0
  }

  terminate(): void {
    if (this.handle === undefined) return
    this.api.terminateJobObject(this.handle, 1)
    this.release()
  }

  close(): void {
    this.release()
  }

  private release(): void {
    if (this.handle === undefined) return
    this.api.closeHandle(this.handle)
    this.handle = undefined
  }
}

/**
 * Assign `pid` to a new kill-on-close job. Returns `undefined` when Job
 * Objects are unavailable or assignment fails, so callers can fall back to
 * `taskkill`.
 * @param pid - the direct child process id.
 * @param bindings - optional kernel32 table; omitted on non-Windows hosts.
 * @returns the job handle, or `undefined` when attachment did not succeed.
 */
export function attachKillOnCloseJob(
  pid: number,
  bindings: Win32JobBindings | undefined = loadWin32JobBindings(),
): Win32Job | undefined {
  if (pid <= 0 || bindings === undefined) return undefined
  const job = bindings.createJobObjectW(null, null)
  if (isNullPtr(job)) return undefined
  const information = Buffer.alloc(JOBOBJECT_EXTENDED_LIMIT_SIZE)
  information.writeUInt32LE(JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, JOBOBJECT_EXTENDED_LIMIT_FLAGS_OFFSET)
  if (bindings.setInformationJobObject(job, JobObjectExtendedLimitInformation, information, information.length) === 0) {
    bindings.closeHandle(job)
    return undefined
  }
  const process = bindings.openProcess(
    PROCESS_TERMINATE | PROCESS_SET_QUOTA | PROCESS_QUERY_LIMITED_INFORMATION,
    0,
    pid,
  )
  if (isNullPtr(process)) {
    bindings.closeHandle(job)
    return undefined
  }
  const assigned = bindings.assignProcessToJobObject(job, process)
  bindings.closeHandle(process)
  if (assigned === 0) {
    bindings.closeHandle(job)
    return undefined
  }
  return new LocalWin32Job(bindings, job)
}
