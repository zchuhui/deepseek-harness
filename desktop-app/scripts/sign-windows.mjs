﻿// Signs one Windows binary with Authenticode. Invoked by tauri build through
// `bundle.windows.signCommand` ("%1" = the file to sign), so the minisign
// updater signature covers the Authenticode-signed installer. Without
// AUTHENTICODE_CERT the helper succeeds without signing: dev builds keep
// working, and the installer ships unsigned until a publisher certificate
// exists. AUTHENTICODE_SIGNTOOL overrides the signtool lookup (set the full
// Windows SDK bin path when it is not on PATH); AUTHENTICODE_TIMESTAMP_URL
// overrides the timestamping server.
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'

const [file] = process.argv.slice(2)
if (file === undefined) throw new Error('sign-windows: the file argument is required')
const cert = process.env.AUTHENTICODE_CERT
const password = process.env.AUTHENTICODE_PASSWORD
if (cert === undefined || cert === '' || password === undefined) {
  console.log('sign-windows: no AUTHENTICODE_CERT/AUTHENTICODE_PASSWORD; ' + file + ' ships without Authenticode')
  process.exit(0)
}
if (!existsSync(cert)) throw new Error('sign-windows: AUTHENTICODE_CERT does not exist: ' + cert)
const signtool = process.env.AUTHENTICODE_SIGNTOOL ?? 'signtool'
const timestamp = process.env.AUTHENTICODE_TIMESTAMP_URL ?? 'http://timestamp.digicert.com'
execFileSync(signtool, [
  'sign', '/fd', 'SHA256', '/tr', timestamp, '/td', 'SHA256', '/f', cert, '/p', password, file,
], { stdio: 'inherit' })
execFileSync(signtool, ['verify', '/pa', file], { stdio: 'inherit' })
console.log('sign-windows: Authenticode signature verified on ' + file)
