# @deepseek-ai/dsh-host-desktop

[English](README.md) | 中文

桌面壳宿主控制是一项能力 seam。抽象的 `DesktopHost` 服务（`ctx.desktopHost`）是其 Service Definition。它的三个方法驱动壳的原生窗口注册表与持久化设置：`reportWindow(label, sessionId)` 记录某窗口当前显示的会话，使深链聚焦所属窗口；`getSettings()` 与 `setSettings(partial)` 读写壳持久化的 `closeToTray`／`launchAtLogin` 标志（`DesktopSettingsDoc`）。壳拥有原生窗口集合与持久化设置；本包声明 provider 通过壳桥接实现的契约（[`-shell`](../desktop-shell/README.md)），调用方因此从不依赖单一传输。

## 模型体验

无：该 seam 服务于宿主的窗口与设置控制；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与待办

- **无壳桥接时 provider 加载失败** —— 唯一 provider [`-shell`](../desktop-shell/README.md) 在 `DSH_DESKTOP_BRIDGE_URL`／`DSH_DESKTOP_BRIDGE_TOKEN` 缺失时于加载期抛错。
- **仅桌面部署组合** —— 该 seam 驱动桌面壳的窗口注册表与持久化设置；非桌面宿主没有可控制的等价能力。
