# 指令文件维度

本插件的第三个管理维度：DSH 每轮会话会读进上下文的**规则文件**（`AGENTS.md` 家族）。
面板只列 DSH **真正会读取**的席位，避免"我明明写了规则，它却没读到"这类问题。

## 一、DSH 到底读哪些文件

规则来自内核 `@deepseek-ai/dsh-agent-instructions`（默认配置，可在插件配置里改候选名）。

| 作用域 | 席位 |
|---|---|
| **用户级** | **只有** `$DSH_HOME/AGENTS.md`（本机即 `~/.dsh/AGENTS.md`）。这一级是**硬编码单名** —— 同级放 `CLAUDE.md`、`AGENTS.local.md` 等**不会被读取**。 |
| **项目级** | 从 `.git` 项目根到会话 cwd 的**每一级目录**，各试 4 个候选名：`AGENTS.md`、`CLAUDE.md`、`AGENTS.local.md`、`CLAUDE.local.md`。同目录内两个常规名都存在时**都会读**。 |

几条容易踩的行为：

- **项目根**由 cwd 向上找最近的 `.git` 决定（`projectRootMarkers` 默认 `[".git"]`；找不到就一直上溯到盘根）。
- **加载顺序 = 优先级**：用户级 → 项目根 → 逐级子目录，**越具体越优先**。
- 同目录内 trim 后内容相同的文件会按 SHA-1 **折叠成一份**。
- 有**总量预算**（内核默认 `maxBytes` 64 KiB），超出会截断 / 省略并在提示里写明；单个文件超过 `maxSourceBytes`（默认 1 MB）会被忽略。
- **不会展开引用**：`AGENTS.md` 里写 `@other.md` 不会被解析（加载器没有 import / include 逻辑）。
- 候选名可配置（`instructionFileCandidates` / `localInstructionFileCandidates`），但**只能是裸文件名** ——
  含 `/` 或 `\` 的会被过滤，所以 `.dsh/AGENTS.md` 这种子目录形态不成立。

DSH **不会读**的常见文件（写在这里可以省一次排查）：`~/.claude/CLAUDE.md`、`~/.codex/AGENTS.md`、
`.claude/commands/*.md`、`GEMINI.md`、`.cursorrules`、`.cursor/rules/*`、`.windsurfrules`、`.clinerules`、
`.github/copilot-instructions.md`、`README.md`。

## 二、面板能做什么

- 按 **用户级 / 项目级**分组列出全部席位，并标注「存在」还是「未创建」、字节数、以及 **`会被读取`** 徽标。
- **查看 / 编辑 / 新建 / 删除**：缺失席位可一键新建（预填 `# <文件名>` 开头）。
- 超过 1 MB 的文件标 ⚠ —— 内核会忽略它，等于规则不生效。
- 编辑保存后写入磁盘，**下一个会话生效**（当前会话已加载的指令不变）。

## 三、为什么没有「启用 / 禁用」开关

技能和 MCP 都有开关，这里**故意没有**：DSH 是按**文件名**选取指令文件的，改名 / 加后缀不是"开关"，
而是语义变更 —— 在 git 里表现为"删掉一个文件 + 新增一个文件"，并且会破坏其它工具对这些文件名的约定
（`AGENTS.md` / `CLAUDE.md` 是跨工具通用约定）。所以这里只做文件本身的操作，不做伪开关。

## 四、安全边界

后端的 `resolveSlot()` 是唯一的写入口，规则是"**只能操作本工作区枚举出的席位**"：

- 传入的 `path` 必须命中 `listInstructions(cwd)` 的结果，否则 500 拒绝 —— 越界目录、非白名单文件名、
  `../` 之类的路径一律不落盘。
- 单次编辑正文上限 **512 KiB**（防止把整个 vault 塞进请求体）。
- 删除为**物理删除**，界面上是两步确认。

## 五、想改候选名 / 加自定义名字

例如想额外支持 `dsh.md`：在 profile 的 `cordis.patch.yml` 里给内核插件加配置（注意 patch 是**整行替换**，
不做字段级 merge，`maxBytes` 是必填）：

```yaml
- id: agent-instructions
  config:
    maxBytes: 65536
    instructionFileCandidates: ['AGENTS.md', 'CLAUDE.md', 'dsh.md']
    localInstructionFileCandidates: ['AGENTS.local.md', 'CLAUDE.local.md']
```

改完**下个会话**生效；面板自动会把这些名字当成新席位列出来（因为席位枚举走的就是同一套规则）。
