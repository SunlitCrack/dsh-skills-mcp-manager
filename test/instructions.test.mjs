/**
 * 指令文件维度的可复现测试（纯 Node，不依赖任何 @deepseek-ai 包）。
 *
 * 被测模块是构建产物 lib/instructions.js —— 它只 import Node 内置模块，
 * 所以这里可以先 `pnpm build`（或 `npm run bundle`）再跑 `npm test`，
 * 也可以在安装了 devDependencies 的机器上直接跑。
 *
 *   node --test test/            # 或 npm test
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  ancestorChain,
  deleteInstruction,
  findProjectRoot,
  listInstructions,
  readInstruction,
  resolveProjectScope,
  resolveSlot,
  writeInstruction,
} from '../lib/instructions.js'

/** 造一个临时项目：<tmp>/{.git/, sub/} + 根 AGENTS.md。 */
function makeProject() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-instr-'))
  mkdirSync(join(root, '.git'), { recursive: true })
  mkdirSync(join(root, 'sub'), { recursive: true })
  writeFileSync(join(root, 'AGENTS.md'), '# scratch root rules\n')
  return root
}

test('项目根定位：向上找最近的 .git', () => {
  const root = makeProject()
  try {
    assert.equal(findProjectRoot(join(root, 'sub')), root)
    assert.equal(findProjectRoot(root), root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('无 .git 标记时项目根 = cwd（内核规则，绝不退化成盘根）', () => {
  const base = mkdtempSync(join(tmpdir(), 'dsh-nomarker-'))
  const deep = join(base, 'a', 'b')
  mkdirSync(deep, { recursive: true })
  try {
    assert.equal(findProjectRoot(deep), deep)
    const scope = resolveProjectScope(deep)
    assert.equal(scope.root, deep)
    assert.equal(scope.markerFound, false)

    const project = listInstructions(deep).filter((s) => s.scope === 'project')
    assert.equal(project.length, 4, '只有会话目录这一层 × 4 个候选名')
    assert.ok(project.every((s) => s.dir === ''), '不应出现任何祖先目录席位')
    assert.ok(project.every((s) => !s.displayPath.includes('/')), '显示路径不应带祖先目录前缀')
  } finally {
    rmSync(base, { recursive: true, force: true })
  }
})

test('ancestorChain：项目根 → cwd，含两端', () => {
  const root = makeProject()
  try {
    const deep = join(root, 'a', 'b')
    mkdirSync(deep, { recursive: true })
    assert.deepEqual(ancestorChain(root, deep), [root, join(root, 'a'), deep])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('席位枚举：用户级 1 席 + 项目级每级目录 4 个候选名', () => {
  const root = makeProject()
  try {
    const slots = listInstructions(join(root, 'sub'))
    const global = slots.filter((s) => s.scope === 'user-global')
    const project = slots.filter((s) => s.scope === 'project')

    assert.equal(global.length, 1)
    assert.equal(global[0].name, 'AGENTS.md')
    assert.equal(global[0].displayPath, '~/.dsh/AGENTS.md')

    assert.equal(project.length, 8, '2 层目录 × 4 个候选名')
    assert.ok(project.some((s) => s.dir === '' && s.name === 'AGENTS.md' && s.exists))
    assert.ok(project.some((s) => s.displayPath === 'AGENTS.md'))
    assert.ok(project.some((s) => s.displayPath === 'sub/AGENTS.md'))
    assert.ok(project.some((s) => s.name === 'CLAUDE.local.md' && !s.exists))
    assert.ok(project.some((s) => s.name === 'AGENTS.local.md' && s.local === true))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('cwd 为空时只列用户级', () => {
  const slots = listInstructions('')
  assert.equal(slots.length, 1)
  assert.equal(slots[0].scope, 'user-global')
})

test('写 / 读 / 删 往返', () => {
  const root = makeProject()
  const target = join(root, 'sub', 'CLAUDE.md')
  try {
    const written = writeInstruction(target, '# sub rules\n', join(root, 'sub'))
    assert.equal(written.exists, true)
    assert.ok(written.bytes > 0)
    assert.equal(readFileSync(target, 'utf8'), '# sub rules\n')

    const detail = readInstruction(target, join(root, 'sub'))
    assert.equal(detail.content, '# sub rules\n')
    assert.equal(detail.truncated, false)

    const deleted = deleteInstruction(target, join(root, 'sub'))
    assert.equal(deleted.exists, false)
    assert.equal(existsSync(target), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('安全边界：越界路径与非白名单文件名一律拒绝', () => {
  const root = makeProject()
  const cwd = join(root, 'sub')
  try {
    const rejected = [
      'C:\\Windows\\AGENTS.md',
      join(root, '..', 'AGENTS.md'),
      join(root, 'sub', 'NOT-A-CANDIDATE.md'),
      join(root, 'sub', 'nested', 'AGENTS.md'), // 更深一层目录不在祖先链上
    ]
    for (const path of rejected) {
      assert.throws(() => resolveSlot(path, cwd), /outside the managed seats/, `应拒绝 ${path}`)
    }

    // 路径先做规范化：<root>/CLAUDE.md/../AGENTS.md 等价于 <root>/AGENTS.md —— 是合法席位
    assert.equal(resolveSlot(join(root, 'CLAUDE.md', '..', 'AGENTS.md'), cwd).path, join(root, 'AGENTS.md'))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('读取不存在的文件报错', () => {
  const root = makeProject()
  try {
    assert.throws(() => readInstruction(join(root, 'sub', 'AGENTS.md'), join(root, 'sub')), /does not exist/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('正文超过 512 KiB 被拒绝', () => {
  const root = makeProject()
  try {
    assert.throws(
      () => writeInstruction(join(root, 'AGENTS.md'), 'x'.repeat(600 * 1024), join(root, 'sub')),
      /exceeds/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('超过 1 MB 的文件被标记 oversize（内核会忽略它）', () => {
  const root = makeProject()
  try {
    const big = join(root, 'sub', 'AGENTS.md')
    writeFileSync(big, 'y'.repeat(1024 * 1024 + 16))
    const slot = listInstructions(join(root, 'sub')).find((s) => s.path === big)
    assert.equal(slot.oversize, true)
    assert.equal(slot.exists, true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('新建不存在的席位后能被枚举到', () => {
  const root = makeProject()
  try {
    const target = join(root, 'AGENTS.local.md')
    assert.equal(listInstructions(join(root, 'sub')).some((s) => s.path === target && s.exists), false)
    writeInstruction(target, '# personal\n', join(root, 'sub'))
    assert.equal(listInstructions(join(root, 'sub')).some((s) => s.path === target && s.exists), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('devDependencies 不会被带入运行时（仓库发布形态自检）', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  // @deepseek-ai/* 必须是 peer，否则 github:/npm 安装会把内核副本一起装进来（遮蔽内核 → 启动失败）
  for (const name of Object.keys(pkg.peerDependencies ?? {})) {
    if (!name.startsWith('@deepseek-ai/')) continue
    assert.equal(pkg.dependencies?.[name], undefined, `${name} 不应出现在 dependencies`)
  }
  assert.ok(readdirSync(new URL('../lib', import.meta.url)).includes('index.js'))
})
