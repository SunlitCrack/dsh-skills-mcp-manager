# dsh-skills-mcp-manager

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 是 DeepSeek 官方的 AI 编程助手框架，命令行工具叫 `dsh`，提供 Web UI、Headless 等运行模式，并通过插件机制扩展能力。

本插件是其中一个独立插件：在 DeepSeek Harness Web GUI 的「设置」页新增一个独立的「技能与 MCP」页面（一级导航入口，与「插件」等并列），用于管理**技能（skills）**、**MCP 服务器**与**指令文件（AGENTS.md 家族）**三个维度。

MCP 是**真实连接**：启用的服务器会通过 @deepseek-ai/dsh-mcp-client 真正连上，并把工具注册为 mcp__<server>__<tool>；启用 / 禁用会实际连接 / 断开。

面板顶部始终显示**当前生效的项目目录及其来源**（`当前会话` / `已选会话` / `首个工作区` / `手动指定`）；
识别不准时可以点「选择目录…」固定一个项目目录（本机保存），或点「恢复自动」回到跟随会话。

## 功能

### Skills 技能

- 区分项目级 / 用户级，按来源分组（.dsh/skills、.agents/skills、~/.dsh/skills、~/.agents/skills）。
- 启用 / 禁用：改写 SKILL.md 前言的 disable-model-invocation + user-invocable，可逆。
- 删除：两步确认，物理删除技能目录（bundle）或平铺 .md 文件。
- 详情：查看 description、whenToUse 与完整正文。
- 导入：指定目录 → 扫描技能 → 勾选导入到 ~/.dsh/skills。支持系统原生目录选择器与手写路径两种方式。
- 搜索 / 过滤：按名称模糊搜索，按「已启用 / 未启用」过滤。

### MCP 服务

- 表单或 JSON 两种方式新建服务器（stdio 的 command/args/env/cwd，或 streamable-http 的 url/headers）。
- 测试连接：一键真实连接探测。
- 启用 / 禁用：真正连接 / 断开，状态实时显示（连接中 / 运行中 / 失败 / 已停止）。
- 名称搜索、编辑、删除（两步确认）。
- 配置持久化到 `$DSH_HOME/mcp.json`（未设置 `DSH_HOME` 时回落 `~/.dsh/mcp.json`）。

### 指令文件

- 列出 DSH 每轮读进上下文的规则文件，按 **用户级 / 项目级** 分组：用户级只有 `~/.dsh/AGENTS.md`
  （这一级是硬编码单名，同级其它名字不读）；项目级是 `.git` 项目根到当前工作目录**每一级**的
  `AGENTS.md` / `CLAUDE.md` / `AGENTS.local.md` / `CLAUDE.local.md`。
  向上找不到 `.git` 时项目根就是**会话目录本身**（与内核 `dsh-agent-instructions` 一致），
  不会把盘根到会话之间的每一级目录都列出来。
- 查看 / 编辑 / 新建 / 删除；缺失的席位显示「未创建」并可一键新建，已存在的显示字节数与「会被读取」徽标。
- **没有启用开关**（有意为之）：DSH 按**文件名**选取，改名不是开关而是语义变更，所以这里只做文件本身的操作。
- 安全边界：只能操作上表枚举出的席位（越界路径一律拒绝），正文上限 512 KiB；超过 1 MB 的文件标 ⚠（DSH 会忽略它）。
- 编辑保存后**下一个会话生效**（当前会话已加载的指令不变）。

> 席位规则、加载顺序与预算、以及"哪些 md 文件 DSH **不会**读"的完整说明：见 [docs/instructions.md](docs/instructions.md)。

## 安装

前置条件：Node.js >= 22.19，并先装好 dsh 命令行（`npm install -g @deepseek-ai/dsh`，`dsh --version` 能打印版本即成功）。

### 方式一：从 GitHub 安装（推荐）

仓库同时包含源码与**构建产物**（`lib/`），可以直接装：

    dsh plugin --profile web add github:SunlitCrack/dsh-skills-mcp-manager
    dsh web

需要锁定版本时在末尾加 tag：

    dsh plugin --profile web add github:SunlitCrack/dsh-skills-mcp-manager#v0.3.3

### 方式二：从源码构建后链接（改代码 / 开发调试）

想改源码、或不想用仓库里的构建产物时：

    git clone https://github.com/SunlitCrack/dsh-skills-mcp-manager.git
    cd dsh-skills-mcp-manager

    pnpm install
    pnpm build                       # tsc 类型检查 → tsdown → scripts/wrap-client.mjs

    # 把本插件装进 web profile
    dsh plugin --profile web add link:$(pwd)

    # 重启 dsh web
    dsh web

Windows PowerShell 下把 `link:$(pwd)` 换成完整路径，例如：

    dsh plugin --profile web add link:E:\path\to\dsh-skills-mcp-manager

`dsh plugin` 会把包装进 profile 并自动加入插件层（本包声明了 `dsh.bundle.patch`），无需手动改配置。改完源码后重跑 `pnpm build`，再重启 `dsh web`。

> 装在 profile 里的是**链接目录**时，请留意一个坑：宿主解析 `@deepseek-ai/dsh-mcp-client`、`@deepseek-ai/dsh-settings` 这类裸导入时会**先命中插件目录自己的 `node_modules`**。若那里存在与内核不同版本的副本，宿主可能加载不匹配的实现而**启动失败**。本仓库自带 `scripts/fix-host-deps.mjs` 帮你把这两个条目的链接指回内核（`--check` 只读体检，修复从不删除任何东西，内核位置由 `DSH_DESKTOP_ROOT` / `DSH_DESKTOP_KERNEL` 指定）；更稳的做法是**构建与安装分离**：在别处构建，只把 `lib/` 拷回被链接的目录。
> （本包对 `@deepseek-ai/*` 只声明 `peerDependencies`，所以**从 GitHub / npm 安装不会带入这些副本，不受此坑影响** —— 只有 `link:` 本地目录安装才需要这个守卫。）

### 方式三：npm

尚未发布到 npm。发布后可用 `dsh plugin --profile web add @sunlitcrack/dsh-skills-mcp-manager@<版本>` 安装。

## 使用

安装并重启后，打开 DeepSeek Harness Web GUI，打开「设置」，在左侧导航选择「技能与 MCP」（与「插件」并列的一级入口），即可看到管理界面。

## 目录结构

    src/
      index.ts                    # Host 半区入口（插件加载 + 设置命名空间 + Agent 公告）
      skills.ts                   # 技能文件系统引擎
      mcp.ts                      # MCP 配置存储 + 真连接管理器
      instructions.ts             # 指令文件席位枚举 / 读写删 + 越界拒绝
      routes.ts                   # /api/dsh-skills-mcp 路由族（技能 / MCP / 指令文件）
      protocol.ts                 # 共享类型与 API 路径
      client/
        index.ts                  # 浏览器半区入口
        SettingsCard.tsx          # 设置页面（一级入口的内容）
        manager.tsx               # 技能 / MCP / 指令文件 管理界面
        api.ts                    # fetch 客户端
        locales.ts                # 双语字典
        settings-card.module.css
    scripts/wrap-client.mjs       # 把浏览器半区打成模块加载器格式
    scripts/fix-host-deps.mjs     # 宿主依赖链接守卫（见「安装」里的提示）
    cordis.patch.yml              # 插件注册行
    package.json                  # dsh.bundle.patch + dsh.client 清单

## MCP 真连接原理

Host 半区的 MCP 管理器在启动 / 保存配置时，把「已启用服务器」收敛成一组活跃连接：

- 每个启用的服务器通过 ctx.plugin(@deepseek-ai/dsh-mcp-client, config) 挂载一个实例，工具注册为 mcp__<server>__<tool>。
- 连接失败会在页面显示原因，点「测试连接」或重新保存可重试。
- 禁用 / 删除会断开连接并注销该服务器的全部工具。

服务器名（name）即 mcp-client 的命名空间，受 [A-Za-z0-9_-]{1,32} 约束且需全局唯一。

## 已知限制

- 只扫描四个可管理的技能根目录，不展示内置 / 运行时技能。
- 导入目的地固定为 ~/.dsh/skills，按目录名 / 文件名去重。
- 指令文件面板只列 DSH 真正会读取的席位（4 个白名单文件名），其余 md 文件不在此管理。
- MCP 服务器凭证（env / headers）以明文存于 ~/.dsh/mcp.json，请自行保证该文件权限（建议 0600）。

## 来源

本项目的起点是 [zebbkira/dsh-skills-mcp-manager](https://github.com/zebbkira/dsh-skills-mcp-manager) v0.2.0；此后由本仓库独立维护。
版本历史与相对起点的改动见 [CHANGELOG.md](CHANGELOG.md)。
