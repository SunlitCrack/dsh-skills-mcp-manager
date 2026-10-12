#!/usr/bin/env node
/**
 * Keep the HOST dependencies this plugin resolves at runtime pointed at the
 * harness kernel instead of a local package-manager copy.
 *
 * Why this exists
 * ---------------
 * When a plugin is installed as a link/copy inside a profile, a bare import
 * such as `@deepseek-ai/dsh-mcp-client` may resolve to the plugin's OWN
 * `node_modules` before the kernel's copy. If a
 * package manager installed a different build there (the manifest's peer range
 * usually admits an older release than the running kernel), the host loads a
 * mismatched copy and **the app can fail to boot** — e.g. a client build that
 * imports a symbol its own older `dsh-attachment` dependency does not export.
 *
 * The fix is mechanical: point the offending entries at the kernel copy and
 * keep the previous entry as a dated backup. This script never deletes
 * anything.
 *
 * Usage
 *   node scripts/fix-host-deps.mjs            # verify + repair
 *   node scripts/fix-host-deps.mjs --check    # verify only (exit 1 when wrong)
 *
 * Kernel location, first one that applies:
 *   1. DSH_DESKTOP_KERNEL  full path to the kernel's node_modules directory
 *   2. DSH_DESKTOP_ROOT    the install root (official Harness or community Desktop)
 *   3. the kernel an existing host-dependency link already points at — on a machine
 *      with two shells installed (official Harness + community Desktop) this keeps
 *      the tree that was chosen deliberately today, instead of re-guessing
 *   4. well-known install roots, see `defaultRoots()` — Windows `D:\DeepSeek Harness`,
 *      `D:\DSH Desktop`, `%LOCALAPPDATA%\Programs\…`, `C:\Program Files\…`;
 *      macOS `/Applications/…`; Linux `~/.local/share/…`
 *
 * With (2) and (4) the layout is probed, newest first:
 *   resources/app/dsh/node_modules            (official Harness 0.2.x; app.asar unwrapped)
 *   resources/app.asar.unpacked/node_modules  (DSH Desktop 0.10.0+)
 *   resources/app/node_modules                (earlier releases)
 *   and the macOS `Contents/Resources/...` prefixes
 *
 * A probed location only counts when it really carries a kernel copy, so an empty
 * or half-installed tree can never win over a usable one.
 *
 * Examples
 *   Windows  set DSH_DESKTOP_ROOT=D:\DeepSeek Harness
 *            set DSH_DESKTOP_ROOT=C:\path\to\DSH Desktop
 *   macOS    export DSH_DESKTOP_ROOT="/Applications/DSH Desktop.app"
 *            (…/DSH Desktop.app/Contents/Resources also works)
 *   Linux    export DSH_DESKTOP_ROOT="$HOME/.local/share/dsh-desktop"
 *
 * Exits 0 even when the kernel cannot be located (so it is safe as a
 * `postinstall` step); under `--check` a missing kernel is reported as a
 * problem.
 */

import { existsSync, mkdirSync, realpathSync, renameSync, symlinkSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Bare specifiers the host half resolves at runtime (keep in sync with lib/index.js
 * imports). Checked against the built output rather than the manifest: the only value
 * import left there is `@deepseek-ai/dsh-mcp-client`. `dsh-settings` was dropped once
 * the kernel started deriving plugin settings from the plugin's own Config schema
 * (0.10.0), which removed the import this list used to protect.
 */
const HOST_DEPS = ['dsh-mcp-client']
/** The scope both the plugin tree and the kernel keep those packages under. */
const SCOPE = '@deepseek-ai'

const checkOnly = process.argv.includes('--check')

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scopeDir = join(pluginRoot, 'node_modules', SCOPE)

/**
 * Kernel `node_modules` layouts under one install root, newest first.
 * The official Harness ships the kernel inside `app.asar` as `dsh/node_modules`;
 * it becomes linkable once dsh-purge unwraps `resources/app`. DSH Desktop 0.10.0
 * moved the unpacked kernel from `resources/app/node_modules` to
 * `resources/app.asar.unpacked/node_modules`; probing keeps a hard-coded layout
 * from pointing at nothing on one layout or at the wrong tree on another.
 * @param root - the install root (or its macOS `Contents/Resources`).
 * @returns candidate paths, probed in order.
 */
function kernelCandidates(root) {
  return [
    join(root, 'resources', 'app', 'dsh', 'node_modules'),
    join(root, 'resources', 'app.asar.unpacked', 'node_modules'),
    join(root, 'resources', 'app', 'node_modules'),
    join(root, 'Contents', 'Resources', 'app', 'dsh', 'node_modules'),
    join(root, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules'),
    join(root, 'Contents', 'Resources', 'app', 'node_modules'),
    join(root, 'app', 'dsh', 'node_modules'),
    join(root, 'app.asar.unpacked', 'node_modules'),
    join(root, 'app', 'node_modules'),
  ]
}

/** Whether a kernel `node_modules` directory actually carries one of the host deps. */
function carriesKernel(path) {
  return HOST_DEPS.some((dep) => existsSync(join(path, SCOPE, dep)))
}

/**
 * Whether a path sits inside a package manager's own store.
 * A `link:`/`file:` dependency resolves through `…/node_modules/.pnpm/<pkg>+<hash>/…`
 * first, which carries a kernel-shaped directory but is a package-manager copy —
 * exactly the thing this script exists to replace, never a kernel to keep.
 */
function isPackageStore(path) {
  return /(?:^|[\\/])\.pnpm[\\/]/.test(path)
}

/**
 * Install roots to probe when the environment names none and nothing is linked yet.
 * These are guesses, so they are only trusted when the tree really carries a kernel
 * copy — a wrong guess must never outrank a detected one.
 * @returns candidate install roots, most likely first.
 */
function defaultRoots() {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? ''
  const localAppData = process.env.LOCALAPPDATA ?? ''
  return [
    'D:\\DeepSeek Harness',
    'D:\\DSH Desktop',
    localAppData === '' ? '' : join(localAppData, 'Programs', 'DeepSeek Harness'),
    localAppData === '' ? '' : join(localAppData, 'Programs', 'DSH Desktop'),
    'C:\\Program Files\\DeepSeek Harness',
    'C:\\Program Files\\DSH Desktop',
    '/Applications/DeepSeek Harness.app',
    '/Applications/DSH Desktop.app',
    home === '' ? '' : join(home, 'Applications', 'DeepSeek Harness.app'),
    home === '' ? '' : join(home, 'Applications', 'DSH Desktop.app'),
    home === '' ? '' : join(home, '.local', 'share', 'deepseek-harness'),
    home === '' ? '' : join(home, '.local', 'share', 'dsh-desktop'),
  ].filter((root) => root !== '')
}

/**
 * The kernel an existing host-dependency link already points at.
 * Requires the whole host-dependency set to sit in that scope, so a package-manager
 * tree (which fans per-peer copies out across `.pnpm/<pkg>+<hash>` directories) can
 * never be mistaken for a kernel.
 * @returns the linked kernel `node_modules` directory, or undefined when nothing
 *   usable is linked yet (a dangling link resolves to undefined as well).
 */
function linkedKernel() {
  for (const dep of HOST_DEPS) {
    const real = realOrUndefined(join(scopeDir, dep))
    if (real === undefined) continue
    if (basename(dirname(real)) !== SCOPE) continue
    if (isPackageStore(real)) continue
    const kernel = dirname(dirname(real))
    if (!HOST_DEPS.every((name) => existsSync(join(kernel, SCOPE, name)))) continue
    return kernel
  }
  return undefined
}

/**
 * Probe one install root for a layout that carries the kernel.
 * @returns the first candidate that carries it, else the first candidate as a
 *   diagnostic path.
 */
function probeRoot(root) {
  const candidates = kernelCandidates(root)
  return candidates.find((path) => carriesKernel(path) && !isPackageStore(path)) ?? candidates[0]
}

/**
 * Resolve the kernel node_modules directory: explicit environment first, then the
 * tree already linked, then well-known install roots.
 * @returns the kernel directory, or undefined when nothing usable was found.
 */
function kernelRoot() {
  if (process.env.DSH_DESKTOP_KERNEL) return process.env.DSH_DESKTOP_KERNEL
  if (process.env.DSH_DESKTOP_ROOT) return probeRoot(process.env.DSH_DESKTOP_ROOT)
  const linked = linkedKernel()
  if (linked !== undefined) return linked
  const hits = defaultRoots().map(probeRoot).filter(carriesKernel)
  if (hits.length > 1) {
    console.log(`note: ${hits.length} kernels found (${hits.join(', ')}); using the first — set DSH_DESKTOP_ROOT to choose another`)
  }
  return hits[0]
}

/** Compare two paths the way Windows resolves links (case-insensitive). */
function samePath(a, b) {
  return a.toLowerCase() === b.toLowerCase()
}

/** Resolve a path through links, or undefined when it does not exist. */
function realOrUndefined(path) {
  try {
    return realpathSync(path)
  } catch {
    return undefined
  }
}

const kernel = kernelRoot()
if (kernel === undefined) {
  const message = [
    'fix-host-deps: kernel location unknown — set DSH_DESKTOP_KERNEL (…/node_modules)',
    '               or DSH_DESKTOP_ROOT (the Desktop install root), then re-run.',
  ].join('\n')
  if (checkOnly) {
    console.log(`✘ ${message}`)
    process.exit(1)
  }
  console.log(message)
  process.exit(0)
}

let problems = 0
let repaired = 0

mkdirSync(scopeDir, { recursive: true })
const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')

for (const dep of HOST_DEPS) {
  const linkPath = join(scopeDir, dep)
  const kernelPath = join(kernel, SCOPE, dep)
  const label = `${SCOPE}/${dep}`
  const kernelReal = realOrUndefined(kernelPath)

  if (kernelReal === undefined) {
    console.log(`✘ ${label}: kernel copy not found at ${kernelPath}`)
    problems += 1
    continue
  }
  const linkReal = realOrUndefined(linkPath)
  if (linkReal !== undefined && samePath(linkReal, kernelReal)) {
    console.log(`✔ ${label}: already linked to the kernel (${kernelReal})`)
    continue
  }

  problems += 1
  const current = linkReal === undefined ? '(absent)' : linkReal
  if (checkOnly) {
    console.log(`✘ ${label}: resolves to ${current}, expected ${kernelReal}`)
    continue
  }

  // Rename the offending entry out of the way (never deleted), then link the kernel copy.
  const backup = join(scopeDir, `${dep}.before-desktop-repair-${stamp}`)
  try {
    if (existsSync(linkPath)) {
      if (existsSync(backup)) {
        console.log(`  … ${label}: backup ${backup} already exists; keeping both`)
        renameSync(linkPath, join(scopeDir, `${dep}.broken-${Date.now()}`))
      } else {
        renameSync(linkPath, backup)
      }
    }
    symlinkSync(kernelPath, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
    console.log(`✘→✔ ${label}: was ${current}; now linked to ${kernelReal}`)
    console.log(`      previous entry kept at ${backup}`)
    repaired += 1
  } catch (error) {
    console.log(`✘ ${label}: repair failed — ${error?.message ?? error}`)
  }
}

if (checkOnly) {
  console.log(problems === 0 ? '\ncheck: all host dependencies point at the kernel ✔' : `\ncheck: ${problems} host dependency/ies need repair ✘`)
  process.exit(problems === 0 ? 0 : 1)
}
console.log(repaired === 0 ? '\nnothing to repair' : `\nrepaired ${repaired} host dependency link(s) — restart the app to pick them up`)
if (problems > 0 && repaired === 0) {
  console.log('WARNING: at least one host dependency is still wrong; the app may fail to boot')
}
