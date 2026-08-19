// Stages the exact Node executable and production dsh dependency closure that
// the NSIS bundle embeds. Release automation supplies both NODE_RUNTIME_EXE
// and NODE_RUNTIME_SHA256; accepting neither a checkout nor PATH here keeps
// the installed application self-contained.
//
// pnpm 10+ restricts self-contained (injected) deploy to workspaces that opt
// into inject-workspace-packages; this workspace keeps the default, so the
// script uses the same legacy-deploy route as the Python SDK builder
// (scripts/build-exe-for-python-sdk.ts): deploy --legacy with a hoisted
// linker, materialize every workspace-package link into real files, repair
// the closure by copying any package directory the deploy dropped
// (link:-overridden vendors and hoisted transitive/peer packages), prune
// development-only files, and finish with a real dsh web boot smoke so a
// broken closure fails here instead of on the installed machine.
import { createHash } from 'node:crypto'
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync, spawn } from 'node:child_process'

const desktopRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const repositoryRoot = dirname(desktopRoot)
const runtimeRoot = join(desktopRoot, 'resources', 'runtime')
/** Workspace node_modules of the deploy source: where the legacy hoister leaves direct dependencies. */
const sourceNodeModules = join(repositoryRoot, 'apps', 'cli', 'node_modules')
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
  execFileSync('pnpm', [
    '--filter', '@deepseek-ai/dsh', 'deploy',
    '--legacy', '--prod',
    '--config.node-linker=hoisted',
    '--config.auto-install-peers=false',
    '--config.link-workspace-packages=true',
    runtimeRoot,
  ], {
    cwd: repositoryRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  // pnpm deploy lays the CLI package out at the target root: lib/bin.js.
  const cli = join(runtimeRoot, 'lib', 'bin.js')
  if (!existsSync(cli)) throw new Error(`pnpm deploy did not stage the dsh CLI: ${cli}`)
  materializeLinks(join(runtimeRoot, 'node_modules'))
  repairMissingWorkspacePackages()
  pruneStaging()
  pruneUnusedProviderSdks()
  cpSync(resolvedNode, join(runtimeRoot, 'node.exe'))
  await smokeBoot()
  writeFileSync(join(runtimeRoot, '.gitkeep'), '')
  console.log(`staged self-contained desktop runtime at ${runtimeRoot}`)
} catch (error) {
  rmSync(runtimeRoot, { recursive: true, force: true })
  mkdirSync(runtimeRoot, { recursive: true })
  writeFileSync(join(runtimeRoot, '.gitkeep'), '')
  throw error
}

/** Copy one package tree as real files, skipping its nested node_modules (the hoisted linker owns those). */
function copyPackage(source, destination) {
  const nestedNodeModules = join(source, 'node_modules')
  cpSync(source, destination, {
    recursive: true,
    dereference: true,
    filter: path => path !== nestedNodeModules && !path.startsWith(nestedNodeModules + sep),
  })
}

/** Every workspace package directory keyed by its published name (vendors, packages, apps). */
function workspacePackageSources() {
  const byName = new Map()
  const roots = [
    join(repositoryRoot, 'vendor'),
    join(repositoryRoot, 'packages'),
    join(repositoryRoot, 'apps'),
  ]
  const visit = (directory, depth) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const path = join(directory, entry.name)
      const manifestPath = join(path, 'package.json')
      if (existsSync(manifestPath)) {
        const name = JSON.parse(readFileSync(manifestPath, 'utf8')).name
        if (typeof name === 'string') byName.set(name, path)
        continue
      }
      if (depth < 2) visit(path, depth + 1)
    }
  }
  for (const root of roots) visit(root, 0)
  return byName
}

/**
 * Copy any workspace/vendored package directory the deploy dropped:
 * link:-overridden vendors never materialize, and the legacy hoister leaves
 * transitive and peer packages beside the deploy source. Node resolves by
 * directory presence, so restoring the missing directories closes the
 * runtime graph. Repeat until a full scan finds nothing missing.
 */
function repairMissingWorkspacePackages() {
  const stagedModules = join(runtimeRoot, 'node_modules')
  const workspaceSources = workspacePackageSources()
  const manifestCandidates = collectManifests(stagedModules)
  manifestCandidates.unshift(join(runtimeRoot, 'package.json'))
  const restored = []
  for (let round = 0; round < 5; round++) {
    const missing = new Map()
    for (const manifestPath of manifestCandidates) {
      if (!existsSync(manifestPath)) continue
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      const entries = { ...(manifest.dependencies ?? {}), ...(manifest.peerDependencies ?? {}) }
      for (const [name, spec] of Object.entries(entries)) {
        if (typeof spec !== 'string') continue
        if (!(spec.startsWith('workspace:') || spec.startsWith('link:') || workspaceSources.has(name))) continue
        if (existsSync(join(stagedModules, name)) || existsSync(join(dirname(manifestPath), 'node_modules', name))) continue
        missing.set(name, spec)
      }
    }
    if (missing.size === 0) break
    for (const name of missing.keys()) {
      const source = workspaceSources.get(name)
        ?? [join(repositoryRoot, 'node_modules', name), join(sourceNodeModules, name)].find(path => existsSync(path))
      if (source === undefined) {
        throw new Error(`stage-runtime: cannot restore dropped dependency ${name} (${missing.get(name)})`)
      }
      const destination = join(stagedModules, name)
      mkdirSync(dirname(destination), { recursive: true })
      copyPackage(source, destination)
      restored.push(name)
    }
  }
  if (restored.length > 0) {
    console.log(`stage-runtime: restored dropped workspace packages: ${[...new Set(restored)].sort().join(', ')}`)
  }
}

/**
 * Remove development-only files the bundled runtime never loads. Besides
 * shrinking the installer, this drops the deepest generated declaration
 * paths that exceed makensis's 260-character path limit on Windows.
 */
function pruneStaging() {
  const suffixes = ['.d.ts', '.d.mts', '.d.cts', '.map', '.ts', '.mts', '.cts']
  let removed = 0
  const visit = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(path)
        continue
      }
      if (suffixes.some(suffix => path.endsWith(suffix))) {
        rmSync(path, { force: true })
        removed += 1
      }
    }
  }
  visit(runtimeRoot)
  console.log(`stage-runtime: pruned ${removed} declaration/source files`)
}

/**
 * Drop pi-ai's nested Mistralai SDK. The desktop runtime's web profile never
 * imports pi-ai's mistral provider (dsh-llm-pi-ai uses only the root entry),
 * and its generated operation filenames exceed makensis's 260-character
 * path limit on Windows, which would fail the NSIS bundle. The closing boot
 * smoke verifies the web profile still starts without it.
 */
function pruneUnusedProviderSdks() {
  const mistralai = join(runtimeRoot, 'node_modules', '@earendil-works', 'pi-ai', 'node_modules', '@mistralai')
  if (!existsSync(mistralai)) return
  rmSync(mistralai, { recursive: true, force: true })
  console.log('stage-runtime: pruned unused pi-ai mistralai SDK')
}

/** Every package manifest in the staged flat layout (scoped packages nest one level deeper) and its package-local installs. */
function collectManifests(stagedModules) {
  const candidates = []
  const visit = (directory, depth) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.pnpm' || entry.name === '.bin') continue
      const path = join(directory, entry.name)
      const manifestPath = join(path, 'package.json')
      if (existsSync(manifestPath)) {
        candidates.push(manifestPath)
        const nested = join(path, 'node_modules')
        if (existsSync(nested)) {
          for (const child of readdirSync(nested, { withFileTypes: true })) {
            if (!child.isDirectory()) continue
            const childManifest = join(nested, child.name, 'package.json')
            if (existsSync(childManifest)) candidates.push(childManifest)
          }
        }
        continue
      }
      if (depth < 2) visit(path, depth + 1)
    }
  }
  visit(stagedModules, 0)
  return candidates
}

/** Replace every workspace-package link below node_modules with real files. */
function materializeLinks(nodeModules) {
  let remaining = findSymlink(nodeModules)
  while (remaining !== undefined) {
    const segments = remaining.slice(nodeModules.length + 1).split(sep)
    const binIndex = segments.lastIndexOf('.bin')
    if (binIndex >= 0) {
      rmSync(join(nodeModules, ...segments.slice(0, binIndex + 1)), { recursive: true, force: true })
      remaining = findSymlink(nodeModules)
      continue
    }
    const destination = remaining
    const source = realpathSync(destination)
    rmSync(destination, { recursive: true, force: true })
    copyPackage(source, destination)
    remaining = findSymlink(nodeModules)
  }
}

/** Return the first symlink below a directory, if one exists. */
function findSymlink(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    const metadata = lstatSync(path)
    if (metadata.isSymbolicLink()) return path
    if (metadata.isDirectory()) {
      const nested = findSymlink(path)
      if (nested !== undefined) return nested
    }
  }
  return undefined
}

/** An unused loopback port for the boot smoke. */
function freePort() {
  return new Promise((resolvePort, rejectPort) => {
    const probe = createServer()
    probe.once('error', rejectPort)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolvePort(port))
    })
  })
}

/**
 * Boot the staged dsh web runtime and require an HTTP answer: the staged
 * closure proves itself runnable before the installer bundles it.
 */
async function smokeBoot() {
  const port = await freePort()
  const child = spawn(
    join(runtimeRoot, 'node.exe'),
    [join(runtimeRoot, 'lib', 'bin.js'), 'web', '--host', '127.0.0.1', '--port', String(port)],
    { cwd: runtimeRoot, stdio: 'ignore', windowsHide: true },
  )
  try {
    const deadline = Date.now() + 90_000
    for (;;) {
      if (child.exitCode !== null) {
        throw new Error(`stage-runtime: dsh web exited early with code ${child.exitCode}`)
      }
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`)
        if (response.status >= 200 && response.status < 500) {
          console.log('stage-runtime: dsh web boot smoke passed')
          return
        }
      } catch {
        // Not ready yet: the server may still be booting.
      }
      if (Date.now() > deadline) throw new Error('stage-runtime: dsh web did not answer within 90s')
      await new Promise(resolveWait => setTimeout(resolveWait, 2000))
    }
  } finally {
    child.kill()
  }
}
