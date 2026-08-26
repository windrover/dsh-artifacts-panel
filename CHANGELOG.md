# Changelog

本项目的所有显著变更都会记录在此文件中，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2025-08-26

### 修复

- 修复「刷新」按钮不触发重新扫描的问题：此前点击后界面会一直停留在「扫描中…」（effect 依赖不含触发 state，最长要等下一次自动刷新或切换目录才恢复）。现在每次点击都会立即重扫。
- 扫描目录不存在时返回 HTTP 404（此前是 500）。
- 手动刷新会先取消进行中的扫描请求（AbortController 随 effect 重跑生效），避免重复扫描与乱序覆盖。

### 变更

- 右下角触发按钮从「浮动胶囊」（圆角 + 阴影 + 悬空）改为**贴窗沿的扁平标签**：吸附在窗口右下角（无阴影、直角贴边、使用窗口边框与底色主题令牌），与 DSH 窗口外观融为一体；详情栏打开时标签自动隐藏，避免遮挡面板内容。

### 新增

- 单元测试（`node:test`）：覆盖宿主端纯函数（`categorize` / `countLines` / `isBinary` / `scanWorkspace` 边界：maxFiles、skipDirs、maxDepth、scope 403、目录不存在 404）与 HTTP 路由行为（405 / 400 / 200 / 404）。
- GitHub Actions CI：push / PR 自动运行测试。
- `LICENSE`（MIT）、`CHANGELOG.md`、README 徽章。

## [0.1.0] - 2025-08-17

### 新增

- 首个可用版本：`POST /api/artifacts/scan` 宿主路由 + `details` 插槽面板 + 右下角重新打开按钮。
- 按类型 / 日期 / 体积 / 行数四种分组，名称 / 体积 / 行数 / 日期四种排序，中英双语。
- 安全默认：`scope: workspace` 仅允许扫描已注册工作区；二进制与超大文件不统计行数；自动跳过 `node_modules`、`.git`、`dist` 等目录。
