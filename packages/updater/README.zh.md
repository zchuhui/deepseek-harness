# updater/ — 应用更新

[English](README.md) | 中文

报告并应用应用更新的能力族:接缝声明渠道、状态、检查与应用,provider 提供更新源。全部为 **product** 包。

| 包 | 角色 | ctx key |
|---|---|---|
| [`updater/`](updater/README.md) | 更新能力接缝 | `ctx.updater` |
| [`updater-manual/`](updater-manual/README.md) | No-op 手动 provider(真实 provider 随桌面壳落地) | 注册 `ctx.updater` |
| [`updater-desktop/`](updater-desktop/README.md) | 经壳桥接报告与应用的桌面 provider | 注册 `ctx.updater` |

本族没有任何模型可见内容:更新状态只流转于 host 代码与 provider 之间。
