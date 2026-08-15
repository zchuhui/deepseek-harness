// Builds the NSIS installer with updater signing, then assembles the update
// manifest from the signed artifacts. The updater key comes from
// TAURI_SIGNING_PRIVATE_KEY / TAURI_SIGNING_PRIVATE_KEY_PASSWORD (defaulting
// to the local dev key); UPDATE_MANIFEST_BASE_URL overrides the artifact URL
// (default: the shell bridge's self-hosting route); UPDATE_VERSION_OVERRIDE
// writes a bumped manifest version for local update-flow testing (the plugin
// only offers versions newer than the running build).
//
// Authenticode: AUTHENTICODE_CERT (path to a .pfx) + AUTHENTICODE_PASSWORD
// enable publisher signing through bundle.windows.signCommand - tauri signs
// the NSIS installer with it BEFORE createUpdaterArtifacts computes the
// minisign signature, so the .sig covers the signed installer. Without the
// certificate the build still succeeds and the installer ships unsigned
// (scripts/sign-windows.mjs owns the signtool invocation). The build always
// overlays createUpdaterArtifacts: true - the committed config keeps it off
// for plain tauri build runs.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const env = { ...process.env }
execFileSync('pnpm', ['run', 'stage-runtime'], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
// The tauri CLI shells out to cargo; sessions started before the Rust install
// lack ~/.cargo/bin on PATH.
const cargoBin = join(env.USERPROFILE ?? '', '.cargo', 'bin')
// process.env spread preserves the Windows 'Path' casing; write back the
// existing key instead of adding a shadowing 'PATH' duplicate.
const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
const currentPath = env[pathKey] ?? ''
if (process.platform === 'win32' && !currentPath.toLowerCase().includes(cargoBin.toLowerCase())) {
  env[pathKey] = cargoBin + ';' + currentPath
}
// tauri build signs updater artifacts from the key CONTENT env; the path
// form is only a fallback for callers that already export it.
if (env.TAURI_SIGNING_PRIVATE_KEY === undefined) {
  env.TAURI_SIGNING_PRIVATE_KEY = readFileSync(join(root, 'updater.key'), 'utf8').trim()
}
if (env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = 'dsh-dev-key'

const hasAuthenticode = env.AUTHENTICODE_CERT !== undefined && env.AUTHENTICODE_CERT !== ''
  && env.AUTHENTICODE_PASSWORD !== undefined
const overlay = { bundle: { createUpdaterArtifacts: true } }
if (hasAuthenticode) {
  const signer = join(root, 'scripts', 'sign-windows.mjs')
  // tauri whitespace-splits the command and substitutes %1 with the file as
  // one argv element, so spaces in the signed path cannot break it.
  overlay.bundle.windows = { signCommand: 'node ' + signer + ' %1' }
}
const overlayDir = mkdtempSync(join(tmpdir(), 'dsh-sign-config-'))
const overlayPath = join(overlayDir, 'config.json')
writeFileSync(overlayPath, JSON.stringify(overlay))
try {
  execFileSync('pnpm', ['tauri', 'build', '--bundles', 'nsis', '--config', overlayPath], { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
} finally {
  rmSync(overlayDir, { recursive: true, force: true })
}
console.log(hasAuthenticode
  ? 'installer Authenticode-signed through bundle.windows.signCommand'
  : 'no AUTHENTICODE_CERT; the installer ships without an Authenticode signature (updater artifacts remain minisign-signed)')

const bundleDir = join(root, 'src-tauri', 'target', 'release', 'bundle', 'nsis')
const setup = readdirSync(bundleDir).find(name => name.endsWith('-setup.exe'))
if (setup === undefined) throw new Error('NSIS installer not produced')
const setupPath = join(bundleDir, setup)
const sigPath = setupPath + '.sig'
if (!existsSync(sigPath)) throw new Error('signed artifact (.sig) missing; enable createUpdaterArtifacts and the signing env')
copyFileSync(setupPath, join(root, 'update-artifact.exe'))
const signature = readFileSync(sigPath, 'utf8').trim()
const version = env.UPDATE_VERSION_OVERRIDE ?? conf.version
const base = env.UPDATE_MANIFEST_BASE_URL
  ?? `https://github.com/deepseek-ai/deepseek-harness/releases/download/desktop-v${version}/${encodeURIComponent(setup)}`
const manifest = {
  version,
  notes: 'Developer milestone update',
  pub_date: new Date().toISOString(),
  platforms: {
    'windows-x86_64': { signature, url: base },
  },
}
writeFileSync(join(root, 'update-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('update-manifest.json written for version ' + version)
