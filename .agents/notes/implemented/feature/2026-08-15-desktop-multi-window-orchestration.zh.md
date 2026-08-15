# Agent Note:桌面多窗口编排

Status: implemented

[English](2026-08-15-desktop-multi-window-orchestration.md) | 中文

## 问题

壳只有一个窗口("main"),每条深链都会导航它,覆盖操作员正在做的事。里程碑方案要求多窗口编排,托盘也没有打开新窗口的入口。

## 决策

- **窗口注册表**(`desktop-app/src-tauri/src/windows.rs`)跟踪每个由壳打开的窗口:标签("main" 加上单调递增的 "win-<n>")映射到其会话。托管状态;条目在打开时加入,随窗口的 `Destroyed` 事件移除,"main" 以无会话状态预登记。
- **深链经注册表路由**(`route_deep_link`):`dsh://` 聚焦主窗口;会话深链聚焦持有该会话的窗口,没有则新建。冷启动的第一条深链改为决定主窗口的 URL——在构建窗口之前经 `deep_link().get_current()` 读取——因此协议启动只用一个窗口显示该会话。
- **桥接新增 windows 平面**:`POST /api/desktop/windows/open { sessionId? }` → `{ label, sessionId }`、`POST /close { label }`(main 隐藏;其他窗口关闭)、`POST /focus { label }`,以及 `GET /windows` → 注册表快照。类型化客户端(`packages/util/desktop-bridge`)镜像这四个调用。
- **托盘新增「新建窗口」**(`open_window`,无会话),并把「打开最新通知」改经 `route_deep_link` 路由,使通知命中持有其会话的窗口而不是总导航主窗口。
- **新窗口加载 `?session=<id>&win=<label>`**;web 客户端目前忽略多余的 `win` 参数,每个窗口是独立的浏览器上下文,因此按窗口会话无需客户端改动。

## 已考虑的替代方案

- **每个窗口都关闭即隐藏。** 不采用:会话窗口真实关闭,注册表条目随 `Destroyed` 移除;只有 main 保留隐藏到托盘的语义。
- **每条深链都导航主窗口(旧行为)。** 不采用:它会覆盖操作员在主窗口的上下文;聚焦持有窗口 + 新窗口兜底能保留上下文。
- **客户端到壳的窗口反馈通道**(GUI 上报每个窗口显示的会话)。推迟:注册表只记录壳发起的导航;限制已文档化,通道等待需要它的桌面设置里程碑界面。

## 后果

- 对操作员已经打开的会话,toast 点击或协议启动会聚焦该窗口而不是重载主窗口。
- 桥接 windows 平面是通用的:未来的宿主侧消费者(桌面设置 UI、测试)无需改动壳即可打开、关闭、聚焦与列举窗口。
- 注册表只记录壳发起的导航;经 GUI 侧栏打开的会话不被跟踪(已文档化限制)。

相关:[协议深链、单实例与 toast 激活](2026-08-15-desktop-protocol-single-instance-toast-activation.md)。
