# Changelog

本项目的所有重要改动都记录在此文件。

格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

## [0.3.3] - 2026-09-28

适配 **DSH Desktop 0.10.0（内核 0.1.7-rc.2）**。本次发布合并了 0.3.1 → 0.3.3 三轮修复（均未单独发布）。
不配套 0.10.0 的旧版本会在启动阶段直接失败，建议升级到本版本。

### 修复

- **设置 API 迁移（0.3.1）**：内核不再导出 `installSettingsSection` / `settingsNamespace`
  （设置改为从插件自身的 Config schema 派生）。原样加载会在 import 阶段抛
  `does not provide an export named 'installSettingsSection'`，而启动审计对**任何**未激活条目都会
  判定启动失败 → 整个 Harness 起不来、退回插件恢复页。已移除该调用与 `SKILLS_MCP_NAMESPACE`，
  两个配置项（`enabled` / `announceToAgent`）改由 `Config` schema 承载，在
  「设置 → 插件 → 插件配置」里编辑。
- **项目级作用域（0.3.2）**：两处 `findProjectRoot` 在向上找不到 `.git` 时返回**盘根**，
  而内核的规则是回落 **cwd**（`dsh-agent-instructions`：the discovered project root, or `cwd`
  when no marker exists；`dsh-skill-filesystem` 同）。后果：指令文件把从盘根到 cwd 的每一级目录
  都列出来（实测会话在非 git 目录时 28 席 / 7 个目录），项目级技能的根被算成 `<盘>\.dsh\skills`
  而永远扫不到项目里的技能。现在与内核一致；显示路径改用 `path.relative()`
  （旧写法 `slice(root.length + 1)` 在盘根下会把 `Users` 截成 `sers`）。
- **项目目录来源（0.3.3）**：客户端读的是 `useSessions` 快照里**不存在**的 `current` 字段，
  选择器恒为空 → 每次都退化成「第一个工作区」，切换会话不跟随。改为内核同款三级来源：
  主视图会话（`retainedBy.mainView > 0`）→ 内核持久化的当前会话（`dsh.sessions.current`）→
  首个工作区；并新增顶部「项目目录 / 来源」一行与 **「选择目录…」/「恢复自动」** 手动指定
  （存 `localStorage`，切会话即时刷新）。

### 变更

- `GET /api/dsh-skills-mcp/skills` 与 `…/instructions` 新增 `projectRoot`、`markerFound` 字段
  （面板据此显示内核实际解析出的项目根及其依据）。
- `scripts/fix-host-deps.mjs`：内核 `node_modules` 位置改为**按布局探测**
  （0.10.0 起在 `resources/app.asar.unpacked/node_modules`，旧版在 `resources/app/node_modules`，
  并覆盖 macOS 的两种前缀），不再写死旧布局；内核位置仍可用 `DSH_DESKTOP_KERNEL` /
  `DSH_DESKTOP_ROOT` 指定。

### 测试

- `node --test` 12 条通过；新增「无 `.git` 标记时项目根 = cwd（内核规则，绝不退化成盘根）」。

### 文档

- 移除旧版本截图（`docs/screenshot*.webp`），README 不再引用图片。

## [0.3.0] - 2026-09-20

本项目独立维护后的第一个版本。起点：[zebbkira/dsh-skills-mcp-manager](https://github.com/zebbkira/dsh-skills-mcp-manager) v0.2.0。

### 新增

- **指令文件维度**：设置页新增「指令文件」页签，管理 DSH 每轮读进上下文的规则文件 ——
  用户级 `$DSH_HOME/AGENTS.md`；项目级为 `.git` 项目根到会话 cwd **每一级目录**下的
  `AGENTS.md` / `CLAUDE.md` / `AGENTS.local.md` / `CLAUDE.local.md`。
  支持查看 / 编辑 / 新建 / 删除；越界路径、非白名单文件名一律拒绝。详见 [docs/instructions.md](docs/instructions.md)。
- `scripts/fix-host-deps.mjs`：**宿主依赖链接守卫**。插件以 link 方式安装时，宿主解析
  `@deepseek-ai/dsh-mcp-client`、`@deepseek-ai/dsh-settings` 会先命中插件目录自己的 `node_modules`；
  若那里是与内核不同版本的副本，可能导致**应用启动失败**。该脚本把这两个条目指回内核副本
  （原条目改名为 `*.before-desktop-repair-<日期>` 留底，**从不删除**）；`--check` 只读体检。
- `LICENSE`（MIT，保留起点作者署名）。
- `docs/`：三张 README 截图（Skills / MCP / 指令文件；WebP q90 · 1240px，合计 ~244 KB）与「指令文件」维度说明。
- `.gitattributes`：统一换行与二进制标记。
- `test/instructions.test.mjs` + `pnpm test`：指令文件维度的 11 条测试（纯 Node，不依赖 `@deepseek-ai/*` 包），覆盖席位枚举、读写删往返、越界与非白名单拒绝、超大正文拒绝、以及"发布形态自检"（`@deepseek-ai/*` 必须留在 peerDependencies）。
- `.github/workflows/ci.yml`：CI —— Node 22 与 24 上跑 `install → typecheck → build → test`。
- `AGENTS.md`：贡献者 / AI agent 说明（结构、常用命令、发布纪律、两个必须知道的坑）。
- `package.json`：补 `keywords`、`test` 脚本与 `"./instructions"` 子路径导出；`tsdown` 增加宿主子入口，产出 `lib/instructions.js`（只依赖 Node 内置模块，便于测试与外部引用）。

### 修复

- **按钮样式退化**：`.btnDanger` / `.btnActive` / `.btnPrimary` 单独使用时缺少基类 `.btn` 的内边距、圆角与
  `white-space:nowrap`，按钮退化成浏览器默认样式（窄行里「删除」二字被压成上下两行）。已修 6 处：
  删除 ×2、表单 / JSON 活动态 ×2、保存 ×2。
- **项目级技能扫不到当前项目**：`SettingsCard` 通过 `recentWorkspaceId` 定位工作区，而目标内核的工作区快照
  没有该字段 → `find` 永远落空 → 退化成"第一个注册的工作区"，项目级技能列表恒为空、界面只剩用户级。
  改为优先取**当前会话的 `cwd`**，其次工作区列表首项。
- 技能列表下新增 `项目工作区：<cwd>` 自查行，让"项目级为空"这类问题可自行定位。

### 变更

- 包名 `@zebbkira/dsh-skills-mcp-manager` → **`@sunlitcrack/dsh-skills-mcp-manager`**；
  `repository` / `homepage` / `bugs` / `author` 指向本仓库。
- `package.json` 移除 `"./src/*": "./src/*"` 通配符导出 —— `dsh-plugin-standard` 红线 2.1.2 不认通配符导出，
  安装 / 注入时会被 MUST 拦截（运行时不使用该入口，`src/` 目录保留）。
- 版本号 `0.2.0` → `0.3.0`。
- `.gitignore` 不再忽略 `lib/`：构建产物随源码提交，`github:` 安装才能拿到入口文件。
- `package.json` 去掉 `postinstall`（对最终用户无意义）；`fix:host-deps` / `check:host-deps` 保留给 link 安装的开发者。

### 说明

- 仓库**同时包含源码与构建产物**（`lib/`，约 125 KB）：因此 `dsh plugin --profile web add github:SunlitCrack/dsh-skills-mcp-manager` 可直接安装。
  改源码后请跑 `pnpm build`（或只重建产物 `npm run bundle`）并把 `lib/` 一起提交。
- 以 `link:` 方式装进 profile 时，任何依赖安装（`pnpm install` 等）之后请跑一次
  `node scripts/fix-host-deps.mjs`，再重启应用。

## [0.2.0] - 2026-08-23（起点基线）

起点版本，由 [zebbkira](https://github.com/zebbkira) 发布，包含本插件的技能与 MCP 管理能力：

- Skills：按项目级 / 用户级分组列表、启停（改写 `SKILL.md` 前言）、详情、从目录导入、搜索过滤。
- MCP：表单 / JSON 新建服务器、测试连接、启停（真实连接与断开）、编辑删除，配置存 `~/.dsh/mcp.json`。
- 通过 `@deepseek-ai/dsh-mcp-client` 挂载真实连接，工具注册为 `mcp__<server>__<tool>`。

[Unreleased]: https://github.com/SunlitCrack/dsh-skills-mcp-manager/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/SunlitCrack/dsh-skills-mcp-manager/releases/tag/v0.3.0
