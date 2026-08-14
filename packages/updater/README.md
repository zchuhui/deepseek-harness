# updater/ — application updates

English | [中文](README.zh.md)

The capability family that reports and applies application updates: the seam declares channel, state, check, and apply; providers supply the update source. All **product** packages.

| Package | Role | ctx key |
|---|---|---|
| [`updater/`](updater/README.md) | Update capability seam | `ctx.updater` |
| [`updater-manual/`](updater-manual/README.md) | No-op manual provider (real providers arrive with the desktop shell) | registers `ctx.updater` |
| [`updater-desktop/`](updater-desktop/README.md) | Desktop provider reporting and applying through the shell bridge | registers `ctx.updater` |

Nothing in this family is model-visible: update state stays between host code and providers.
