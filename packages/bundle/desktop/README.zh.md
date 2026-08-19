# `@deepseek-ai/dsh-desktop`

[English](README.md) | 中文

桌面壳的宿主面组合包：[`cordis.patch.yml`](cordis.patch.yml) 挂载通知桥 [`dsh-notify-events`](../../notify/notify-events/README.md)（`turnCompleted: true`）与桌面 toast provider [`dsh-notifications-desktop`](../../notify/notifications-desktop/README.md)，作为 `desktop` profile 的最后一层叠在 `dsh-web-app` 之上。任务完成 toast 默认为「仅后台」：provider 把 `turn-completed` 通知标记为后台专用，壳在任一窗口持有焦点时抑制它。该包没有运行时 API；profile 组合器通过 manifest（元数据清单）的 `dsh.bundle.patch` 字段解析 patch，绝不通过代码。

## 模型体验

通过插入的行间接产生影响；通知包不注册任何面向模型的内容。

#### KV Cache 影响

无直接影响；每条插入行的影响由其所属的包负责。

## 已知限制与暂缓事项

- **宿主壳同侪尚未挂载** —— `host-desktop-shell`、`updater-desktop`、`credentials-desktop` 仍未接入本组合包；它们随各自里程碑落地后加入。
