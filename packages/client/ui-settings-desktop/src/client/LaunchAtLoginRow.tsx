/**
 * Launch-at-login preference row registered into the General section item
 * slot: title + description + a switch. Hidden while the desktop settings
 * surface is unavailable, and on non-Windows hosts. Registered by this
 * package — the desktop shell owns its settings surface.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createDesktopSettingsStore, DesktopSettingsInjected } from './settings-store.ts'
import css from './DesktopSettingRow.module.css'

/** Full component props: runtime share + store share + locale seat + injected face. */
export type LaunchAtLoginRowProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createDesktopSettingsStore>>
  & PropsLocale<'settings.desktop'> & DesktopSettingsInjected

/**
 * Render the Launch-at-login row.
 * @param props - composed slot props.
 * @returns the row, or null when unavailable or on a non-Windows host.
 */
export function LaunchAtLoginRow({ t, toggle, isWindows, useStore }: LaunchAtLoginRowProps) {
  const status = useStore(s => s.status)
  const launchAtLogin = useStore(s => s.launchAtLogin)
  if (!isWindows || status !== 'ready') return null
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('desktop.launchAtLogin.title')}</div>
        <div className={css.desc}>{t('desktop.launchAtLogin.description')}</div>
      </div>
      <button
        type="button"
        className={css.switch}
        role="switch"
        aria-checked={launchAtLogin}
        aria-label={t('desktop.launchAtLogin.title')}
        onClick={() => { toggle('launchAtLogin', !launchAtLogin) }}
      >
        <span className={css.track} data-on={launchAtLogin || undefined} aria-hidden="true">
          <span className={css.thumb} />
        </span>
      </button>
    </div>
  )
}
