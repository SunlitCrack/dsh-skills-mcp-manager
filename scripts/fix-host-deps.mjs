#!/usr/bin/env node
/**
 * Keep the HOST dependencies this plugin resolves at runtime pointed at the
 * harness kernel instead of a local package-manager copy.
 *
 * Why this exists
 * ---------------
 * When a plugin is installed as a link/copy inside a profile, a bare import
 * such as `@deepseek-ai/dsh-mcp-client` or `@deepseek-ai/dsh-settings` may
 * resolve to the plugin's OWN `node_modules` before the kernel's copy. If a
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
 * Kernel location (first one that applies):
 *   DSH_DESKTOP_KERNEL  full path to the kernel's node_modules directory
 *   DSH_DESKTOP_ROOT    the Desktop install root; the layout is probed, newest first:
 *                         resources/app.asar.unpacked/node_modules   (DSH Desktop 0.10.0+)
 *                         resources/app/node_modules                (earlier releases)
 *                         and the macOS `Contents/Resources/...` prefixes of both
 *
 * Examples
 *   Windows  set DSH_DESKTOP_ROOT=C:\path\to\DSH Desktop
 *   macOS    export DSH_DESKTOP_ROOT="/Applications/DSH Desktop.app"
 *            (…/DSH Desktop.app/Contents/Resources also works)
 *   Linux    export DSH_DESKTOP_ROOT="$HOME/.local/share/dsh-desktop"
 *
 * Exits 0 even when the kernel cannot be located (so it is safe as a
 * `postinstall` step); under `--check` a missing kernel is reported as a
 * problem.
 */

import { existsSync, mkdirSync, realpathSync, renameSync, symlinkSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Bare specifiers the host half resolves at runtime (keep in sync with lib/index.js imports). */
const HOST_DEPS = ['dsh-mcp-client', 'dsh-settings']
/** The scope both the plugin tree and the kernel keep those packages under. */
const SCOPE = '@deepseek-ai'

const checkOnly = process.argv.includes('--check')

const pluginRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const scopeDir = join(pluginRoot, 'node_modules', SCOPE)

/**
 * Kernel `node_modules` layouts under one Desktop install root, newest first.
 * DSH Desktop 0.10.0 moved the unpacked kernel from `resources/app/node_modules`
 * to `resources/app.asar.unpacked/node_modules`, so a hard-coded layout either
 * points at nothing on 0.10.0 or at the wrong tree on earlier releases.
 * @param root - the Desktop install root (or its macOS `Contents/Resources`).
 * @returns candidate paths, probed in order.
 */
function kernelCandidates(root) {
  return [
    join(root, 'resources', 'app.asar.unpacked', 'node_modules'),
    join(root, 'resources', 'app', 'node_modules'),
    join(root, 'Contents', 'Resources', 'app.asar.unpacked', 'node_modules'),
    join(root, 'Contents', 'Resources', 'app', 'node_modules'),
    join(root, 'app.asar.unpacked', 'node_modules'),
    join(root, 'app', 'node_modules'),
  ]
}

/**
 * Resolve the kernel node_modules directory from the environment.
 * @returns the first candidate that actually carries the kernel copy, else the
 *   first candidate as a diagnostic path, or undefined without a root hint.
 */
function kernelRoot() {
  if (process.env.DSH_DESKTOP_KERNEL) return process.env.DSH_DESKTOP_KERNEL
  if (process.env.DSH_DESKTOP_ROOT) {
    const candidates = kernelCandidates(process.env.DSH_DESKTOP_ROOT)
    return candidates.find((path) => existsSync(join(path, SCOPE, HOST_DEPS[0]))) ?? candidates[0]
  }
  return undefined
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
