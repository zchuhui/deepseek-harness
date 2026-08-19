import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { spawnSubprocess } from '../src/spawn.ts'
import type { Win32Job } from '../src/win32-job.ts'

const spillDir = mkdtempSync(join(tmpdir(), 'dsh-subprocess-job-spec-'))

function nodeSleepSpec(ms: number) {
  return {
    argv: [process.execPath, '-e', `setTimeout(() => {}, ${ms})`],
    cwd: process.cwd(),
    stdio: {
      stdin: 'ignore' as const,
      stdout: { maxBytes: 1024 },
      stderr: { maxBytes: 1024 },
    },
    graceMs: 3_000,
  }
}

function killPid(pid: number): void {
  try {
    process.kill(pid, 'SIGKILL')
  } catch {
    // Already gone — matches taskkill's tolerated not-found status.
  }
}

function recordingJob(
  pid: number,
  alive = true,
): { job: Win32Job; terminated: number; closed: number; setAlive: (value: boolean) => void } {
  let current = alive
  let terminated = 0
  let closed = 0
  return {
    get terminated() { return terminated },
    get closed() { return closed },
    setAlive(value: boolean) { current = value },
    job: {
      queryAlive: () => current,
      terminate() {
        terminated += 1
        current = false
        killPid(pid)
      },
      close() {
        closed += 1
        current = false
      },
    },
  }
}

describe('Windows Job Object spawn trees', () => {
  it('terminates through the attached job instead of taskkill', async () => {
    let recording: ReturnType<typeof recordingJob> | undefined
    let taskkillPid: number | undefined
    const running = spawnSubprocess(nodeSleepSpec(60_000), {
      spillDir,
      platform: 'win32',
      attachJob: (pid) => {
        recording = recordingJob(pid)
        return recording.job
      },
      taskkill: (pid) => { taskkillPid = pid },
    })
    running.terminate()
    await running.waitForExit()
    await running.done
    expect(recording?.terminated).toBe(1)
    expect(taskkillPid).toBeUndefined()
  })

  it('falls back to taskkill when job attachment fails', async () => {
    const killed: number[] = []
    const running = spawnSubprocess(nodeSleepSpec(60_000), {
      spillDir,
      platform: 'win32',
      attachJob: () => undefined,
      taskkill: (pid) => {
        killed.push(pid)
        killPid(pid)
      },
    })
    running.terminate()
    await running.waitForExit()
    await running.done
    expect(killed).toEqual([running.pid])
  })

  it('waitForExit follows job liveness independently of the direct child handle', async () => {
    let recording: ReturnType<typeof recordingJob> | undefined
    const running = spawnSubprocess(nodeSleepSpec(60_000), {
      spillDir,
      platform: 'win32',
      attachJob: (pid) => {
        recording = recordingJob(pid)
        return recording.job
      },
      taskkill: () => {},
    })
    const waiting = running.waitForExit()
    recording?.setAlive(false)
    await expect(waiting).resolves.toBe(true)
    killPid(running.pid)
    await running.done
  })
})
