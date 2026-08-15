// @vitest-environment jsdom
/** Row components: ready renders title + switch state, unavailable/loading
 * render null, click triggers the injected toggle, and launch-at-login gates
 * on Windows. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore, type SessionListState, type WorkspaceListState } from '@deepseek-ai/dsh-client-runtime/client'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-web-react'
// Type-only: loads the LocaleNamespaceMap merge for 'settings.desktop'.
import type {} from '../src/client/index.ts'
import { CloseToTrayRow, type CloseToTrayRowProps } from '../src/client/CloseToTrayRow.tsx'
import { LaunchAtLoginRow, type LaunchAtLoginRowProps } from '../src/client/LaunchAtLoginRow.tsx'
import { createDesktopSettingsStore } from '../src/client/settings-store.ts'

afterEach(cleanup)

const COPY: Record<string, string> = {
  'desktop.closeToTray.title': 'Close to tray',
  'desktop.launchAtLogin.title': 'Launch at login',
}

/** Empty global standard-kit hooks (the rows read neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceListState>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    baselinesReady: true, recentWorkspaceId: undefined,
  })
  return bindSnapshotSelector(store)
}

type Status = 'loading' | 'ready' | 'unavailable'

function mountCloseToTray(status: Status = 'ready', closeToTray = false) {
  const store = createDesktopSettingsStore().create()
  if (status === 'ready') store.actions.accept({ closeToTray, launchAtLogin: false })
  if (status === 'unavailable') store.actions.markUnavailable()
  const toggle = vi.fn()
  const props: CloseToTrayRowProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: key => COPY[key] ?? key,
    toggle,
    isWindows: false,
  }
  render(<CloseToTrayRow {...props} />)
  return { store, toggle }
}

function mountLaunchAtLogin(isWindows: boolean, status: Status = 'ready', launchAtLogin = false) {
  const store = createDesktopSettingsStore().create()
  if (status === 'ready') store.actions.accept({ closeToTray: false, launchAtLogin })
  if (status === 'unavailable') store.actions.markUnavailable()
  const toggle = vi.fn()
  const props: LaunchAtLoginRowProps = {
    useSessions: emptySessions(),
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: key => COPY[key] ?? key,
    toggle,
    isWindows,
  }
  render(<LaunchAtLoginRow {...props} />)
  return { store, toggle }
}

const switchOf = (name: string): string | null =>
  screen.getByRole('switch', { name }).getAttribute('aria-checked')

describe('CloseToTrayRow', () => {
  it('renders the title and switch state when ready', () => {
    mountCloseToTray('ready', true)
    expect(screen.getByText('Close to tray')).toBeDefined()
    expect(switchOf('Close to tray')).toBe('true')
  })

  it('renders null while loading', () => {
    mountCloseToTray('loading')
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('renders null while unavailable', () => {
    mountCloseToTray('unavailable')
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('toggles the value on click', () => {
    const b = mountCloseToTray('ready', false)
    fireEvent.click(screen.getByRole('switch', { name: 'Close to tray' }))
    expect(b.toggle).toHaveBeenCalledWith('closeToTray', true)
  })
})

describe('LaunchAtLoginRow', () => {
  it('renders the title and switch state on Windows', () => {
    mountLaunchAtLogin(true, 'ready', true)
    expect(screen.getByText('Launch at login')).toBeDefined()
    expect(switchOf('Launch at login')).toBe('true')
  })

  it('renders null on non-Windows hosts', () => {
    mountLaunchAtLogin(false, 'ready', true)
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('renders null while unavailable', () => {
    mountLaunchAtLogin(true, 'unavailable')
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('toggles the value on click', () => {
    const b = mountLaunchAtLogin(true, 'ready', false)
    fireEvent.click(screen.getByRole('switch', { name: 'Launch at login' }))
    expect(b.toggle).toHaveBeenCalledWith('launchAtLogin', true)
  })
})
