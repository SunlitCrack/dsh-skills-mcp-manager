# 贡献者 / AI agent 说明

本仓库是 [DSH（DeepSeek Harness）](https://github.com/deepseek-ai/deepseek-harness) 插件：在 Web GUI 的「设置」页提供一个「技能与 MCP」面板，管理**技能（skills）**、**MCP 服务器**与**指令文件（AGENTS.md 家族）**三个维度。

## 结构

| 路径 | 作用 |
|---|---|
| `src/index.ts` | 宿主半区入口（挂路由、设置命名空间、向 Agent 公告） |
| `src/{skills,mcp,instructions}.ts` | 三个维度的宿主实现（`instructions.ts` 负责指令文件席位枚举与读写删） |
| `src/routes.ts` | `/api/dsh-skills-mcp` 路由族（每个维度一组） |
| `src/client/` | 浏览器半区（React）；`manager.tsx` 是三个页签的界面，`SettingsCard.tsx` 是设置页入口 |
| `lib/` | **构建产物，随源码提交** —— `github:` 安装直接取这里的入口文件，所以改源码后必须重建并提交 |
| `docs/instructions.md` | 指令文件维度的规则说明（席位、顺序、预算、不读清单、安全边界） |
| `docs/*.webp` | README 截图 |

## 常用命令

```sh
pnpm install
pnpm build          # tsc 类型检查 → tsdown → scripts/wrap-client.mjs（打包浏览器半区）
npm run bundle      # 只重建产物（跳过类型检查）
pnpm test           # node --test test/ —— 指令文件维度的测试
```

改了 `src/` 之后：`pnpm build` → `pnpm test` → **把 `lib/` 的变更一起提交**（否则从 GitHub 安装的人拿到的还是旧代码）。

## 版本与发布纪律

1. 改动先写进 `CHANGELOG.md` 的 `## [Unreleased]`；
2. 发版：`Unreleased` → `## [x.y.z] - 日期`，同步 `package.json` 的 `version`，提交后打附注标签：`git tag -a vX.Y.Z -m "…"`；
3. 版本号按 SemVer：加功能递增 minor，只修 bug 递增 patch。

## 两个必须知道的坑

1. **`link:` 安装的目录里不要留会被内核依赖遮蔽的 `node_modules`。**
   宿主解析 `@deepseek-ai/dsh-mcp-client`、`@deepseek-ai/dsh-settings` 这类裸导入时会**先命中插件目录自己的 `node_modules`**；
   若那里存在与内核不同版本的副本，宿主可能加载不匹配的实现而**启动失败**。
   本仓库的 `scripts/fix-host-deps.mjs` 就是为此而生：`--check` 只读体检，修复只做"改名留底 + 建链接"（**从不删除**），
   内核位置由 `DSH_DESKTOP_ROOT` / `DSH_DESKTOP_KERNEL` 指定。更稳的做法是**构建与安装分离**：在别处构建，只把 `lib/` 拷回去。
2. **`@deepseek-ai/*` 一律只声明为 `peerDependencies`。**
   这样从 GitHub / npm 安装才不会把内核副本一起装进来。`test/instructions.test.mjs` 里有一条断言守着这一点，别删。
