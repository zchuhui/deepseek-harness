# 桌面

[English](desktop.md) | 中文

桌面壳集成：Tauri 壳拥有原生窗口集合与持久化的「关闭到托盘 / 开机自启」设置（[desktop-app README](../../desktop-app/README.md)），本页的包把 dsh 宿主与 web GUI 接到这些原生原语上。壳拉起本地 `dsh web` 进程、在原生窗口中渲染 web GUI，并提供带 token 鉴权的回环 HTTP 桥接；桥接端点契约在同一份 desktop-app README 中。

## 桌面宿主 seam

[`@deepseek-ai/dsh-host-desktop`](../../packages/host/desktop) 是宿主插件驱动壳的原生窗口注册表与持久化设置所经的能力 seam。抽象 `DesktopHost` 服务注册为 `ctx.desktopHost`（每个 context 一个实现；加载第二个会抛出）。它有三个方法：

- `reportWindow(label, sessionId)` 记录某窗口当前显示的会话——窗口注册表中由客户端上报的那一半——使 `dsh://` 深链聚焦所属窗口而不是再开一个。
- `getSettings()` 读取壳设置文档。
- `setSettings(partial)` 应用部分文档；省略的字段保持原值，解析出完整的更新后文档。

provider [`@deepseek-ai/dsh-host-desktop-shell`](../../packages/host/desktop-shell) 通过把每个调用转发给壳桥接来实现该 seam。桥接环境（`DSH_DESKTOP_BRIDGE_URL` / `DSH_DESKTOP_BRIDGE_TOKEN`）缺失时它在加载期大声失败，组合行不可能静默退化为没有宿主控制。

## 公开类型

来源：[`packages/host/desktop/src/index.ts`](../../packages/host/desktop/src/index.ts)

```ts type-equiv
/** The shell settings document: the two flags the shell persists across runs. */
interface DesktopSettingsDoc {
  /** Whether closing the main window hides it instead of quitting. */
  closeToTray: boolean
  /** Whether the shell starts at login. */
  launchAtLogin: boolean
}
```

## 壳桥接

[`@deepseek-ai/dsh-desktop-bridge`](../../packages/util/desktop-bridge) 是壳回环 HTTP API（`127.0.0.1:3901`）的零依赖类型化客户端。每个请求都携带当次运行的 token（`x-dsh-bridge-token`）；非 2xx 应答以 `DesktopBridgeError` reject，传输失败以 fetch 错误 reject，keychain 读取的 404 解析为 `undefined`。端点契约（toast、目录选择器、keychain、窗口、设置、updater）由 [desktop-app README](../../desktop-app/README.md) 拥有；本包只负责客户端类型。

## 桌面 provider

三个宿主 provider 通过同一桥接实现 harness 能力 seam：

- [`@deepseek-ai/dsh-notifications-desktop`](../../packages/notify/notifications-desktop) 实现 `ctx.notifications`，把每条通知渲染为原生 toast；可选 `sessionId` 成为 toast 的 `dsh://` 激活深链。
- [`@deepseek-ai/dsh-updater-desktop`](../../packages/updater/updater-desktop) 在壳的 Tauri updater 之上实现 `ctx.updater`：`state()` 读取整体替换式缓存，`check()` 拉取壳的线上状态，`apply()` 转发给壳。
- [`@deepseek-ai/dsh-credentials-desktop`](../../packages/credentials/credentials-desktop) 从壳 keychain 解析凭据引用，叠加在只读进程环境之下。

## Web GUI 设置行

[`@deepseek-ai/dsh-client-ui-settings-desktop`](../../packages/client/ui-settings-desktop) 渲染「通用」设置区的两行开关（关闭到托盘与开机自启），通过仅 loopback 可用的 `desktop` RPC 域读写设置文档。只要域应答 `desktop-unavailable`、读取失败或页面权威不是 loopback，两行就都保持隐藏；开机自启行还只在 Windows 上渲染。两行共享一个 store 实例：控制器在激活与重连时加载，乐观写入每个开关，写入失败时通过重新加载回滚。

## 宿主 RPC 面

web 客户端通过 [`@deepseek-ai/dsh-host-apiproxy`](../../packages/host/apiproxy) 提供的三个一元 RPC 方法触达桌面宿主：

- `host.reportWindow { label, sessionId }` —— 浏览器上报其窗口当前显示的会话；应答 `{ reported: true }`。
- `desktop.getSettings {}` —— 读取设置文档。
- `desktop.setSettings { closeToTray?, launchAtLogin? }` —— 应用部分文档并应答完整文档。

未组合桌面宿主服务的部署对三者都应答 `desktop-unavailable`。三个方法都在 [`@deepseek-ai/dsh-client-connection`](../../packages/client/connection) 的 loopback 钉定特权集合里，远程浏览器无法触达。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxdesktophost--desktophost-abstract-seam"></a>

### `ctx.desktopHost` — `DesktopHost` (abstract seam)

Abstract desktop-shell host-control service. Subclass, implement the three methods, and load the subclass as a plugin — it registers as `ctx.desktopHost` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior).

```ts cordis-catalog
/**
 * Record the session one window now shows (the client-reported half of the
 * shell's window registry), so a deep link focuses the owning window.
 * @param label - shell window label ("main" or "win-<n>").
 * @param sessionId - session the window shows, or null for none.
 */
abstract reportWindow(label: string, sessionId: string | null): Promise<void>

/**
 * Read the shell settings document.
 * @returns the close-to-tray and launch-at-login flags.
 */
abstract getSettings(): Promise<DesktopSettingsDoc>

/**
 * Apply a partial settings document; omitted fields keep their values.
 * @param partial - close-to-tray and/or launch-at-login.
 * @returns the complete updated document.
 */
abstract setSettings(partial: Partial<DesktopSettingsDoc>): Promise<DesktopSettingsDoc>
```

Source: [`packages/host/desktop/src/index.ts:33`](../../packages/host/desktop/src/index.ts)

<a id="ctxnotifications--notificationservice-abstract-seam"></a>

### `ctx.notifications` — `NotificationService` (abstract seam)

Abstract notification service. Subclass, implement notify, and load the subclass as a plugin — it registers as ctx.notifications (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

notify rejects on delivery failure (unsupported platform, spawn error); the seam defines no fallback, and consumers own failure containment so a broken notification can never break the event dispatch that raised it.

```ts cordis-catalog
/**
 * Deliver one notification on the provider's channel.
 * @param notification - the consumer-built notification to render.
 */
abstract notify(notification: Notification): Promise<void>
```

Source: [`packages/notify/notifications/src/index.ts:33`](../../packages/notify/notifications/src/index.ts)

<a id="ctxupdater--updateservice-abstract-seam"></a>

### `ctx.updater` — `UpdateService` (abstract seam)

Abstract update service. Subclass, implement the three operations, and load the subclass as a plugin — it registers as `ctx.updater` (one implementation per context; loading a second throws, which is cordis' standard duplicate-service behavior).

```ts cordis-catalog
/**
 * Synchronous snapshot of the channel's last observed update state. It never
 * triggers a check or any network work.
 * @returns the current snapshot.
 */
abstract state(): UpdateState

/**
 * Explicitly trigger one update check. A provider may perform network work
 * here; the no-op provider only advances the check timestamp.
 * @param signal - optional cancellation of the check.
 * @returns the post-check snapshot.
 */
abstract check(signal?: AbortSignal): Promise<UpdateState>

/**
 * Apply one offered update to the named version.
 * @param version - the version to apply.
 * @param signal - optional cancellation of the apply.
 */
abstract apply(version: string, signal?: AbortSignal): Promise<void>
```

Source: [`packages/updater/updater/src/index.ts:45`](../../packages/updater/updater/src/index.ts)
<!-- END GENERATED cordis-surface -->
