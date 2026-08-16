// Stages the exact Node executable and production dsh dependency closure that
// the NSIS bundle embeds. Release automation supplies both NODE_RUNTIME_EXE
// and NODE_RUNTIME_SHA256; accepting neither a checkout nor PATH here keeps
// the installed application self-contained.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = dirname(desktopRoot)
const runtimeRoot = join(desktopRoot, 'resources', 'runtime')
const nodeExe = process.env.NODE_RUNTIME_EXE
const expectedHash = process.env.NODE_RUNTIME_SHA256?.toLowerCase()
if (nodeExe === undefined || expectedHash === undefined) {
  throw new Error('NODE_RUNTIME_EXE and NODE_RUNTIME_SHA256 are required to stage the release runtime')
}
const resolvedNode = resolve(nodeExe)
if (!existsSync(resolvedNode)) throw new Error(`NODE_RUNTIME_EXE does not exist: ${resolvedNode}`)
const actualHash = createHash('sha256').update(readFileSync(resolvedNode)).digest('hex')
if (actualHash !== expectedHash) throw new Error(`NODE_RUNTIME_SHA256 mismatch for ${resolvedNode}`)

rmSync(runtimeRoot, { recursive: true, force: true })
mkdirSync(runtimeRoot, { recursive: true })
try {
  execFileSync('pnpm', ['--filter', '@deepseek-ai/dsh', 'deploy', '--prod', runtimeRoot], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  const cli = join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  if (!existsSync(cli)) throw new Error(`pnpm deploy did not stage the dsh CLI: ${cli}`)
  cpSync(resolvedNode, join(runtimeRoot, 'node.exe'))
  writeFileSync(join(runtimeRoot, '.gitkeep'), '')
  console.log(`staged self-contained desktop runtime at ${runtimeRoot}`)
} catch (error) {
  rmSync(runtimeRoot, { recursive: true, force: true })
  mkdirSync(runtimeRoot, { recursive: true })
  writeFileSync(join(runtimeRoot, '.gitkeep'), '')
  throw error
}
