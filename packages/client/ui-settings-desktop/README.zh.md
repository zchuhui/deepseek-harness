# @deepseek-ai/dsh-client-ui-settings-desktop

[English](README.md) | 中文

「通用」设置区的桌面壳设置行。两行开关——关闭到托盘与开机自启——通过仅 loopback 可用的 `desktop` RPC 域（`desktop.getSettings` / `desktop.setSettings`）读写桌面壳的设置文档。普通 `dsh web` 部署不组合桌面 host 服务，远程浏览器也到不了特权 desktop 方法，因此当该域应答 `desktop-unavailable`、读取失败或页面来源非 loopback 时两行都隐藏；开机自启行仅在 Windows 上渲染（从 `navigator.userAgent` 读取）。两行共享一个 store 实例；控制器在激活与重连时加载设置，乐观写入每次开关，写入失败时通过重载回滚。`/client` 导出面为插件本体（`apply`／`inject`）以及 store 工厂与注入面类型。

## 模型体验

无，这两行管理的是浏览器偏好；没有任何内容进入模型请求。

#### KV Cache 影响

无；本包既不组装也不发送 provider 请求。

## 已知限制与暂缓事项

- **桌面壳设置仅限 loopback**：远程浏览器或未组合桌面 host 服务的部署看不到这两行；设置本身存在于壳中，本包只负责渲染与写入。
