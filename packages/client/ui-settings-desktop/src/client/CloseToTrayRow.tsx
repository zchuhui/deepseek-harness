/**
 * Close-to-tray preference row registered into the General section item slot:
 * title + description + a switch. Hidden while the desktop settings surface
 * is unavailable. Registered by this package — the desktop shell owns its
 * settings surface.
 */
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type { createDesktopSettingsStore, DesktopSettingsInjected } from './settings-store.ts'
import css from './DesktopSettingRow.module.css'

/** Full component props: runtime share + store share + locale seat + injected face. */
export type CloseToTrayRowProps =
  PropsRuntime<'settings.general.item'> & PropsStore<ReturnType<typeof createDesktopSettingsStore>>
  & PropsLocale<'settings.desktop'> & DesktopSettingsInjected

/**
 * Render the Close-to-tray row.
 * @param props - composed slot props.
 * @returns the row, or null while the desktop settings surface is unavailable.
 */
export function CloseToTrayRow({ t, toggle, useStore }: CloseToTrayRowProps) {
  const status = useStore(s => s.status)
  const closeToTray = useStore(s => s.closeToTray)
  if (status !== 'ready') return null
  return (
    <div className={css.row}>
      <div className={css.rowText}>
        <div className={css.title}>{t('desktop.closeToTray.title')}</div>
        <div className={css.desc}>{t('desktop.closeToTray.description')}</div>
      </div>
      <button
        type="button"
        className={css.switch}
        role="switch"
        aria-checked={closeToTray}
        aria-label={t('desktop.closeToTray.title')}
        onClick={() => { toggle('closeToTray', !closeToTray) }}
      >
        <span className={css.track} data-on={closeToTray || undefined} aria-hidden="true">
          <span className={css.thumb} />
        </span>
      </button>
    </div>
  )
}
