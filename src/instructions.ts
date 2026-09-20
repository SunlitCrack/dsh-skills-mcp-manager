/**
 * Instruction files — the third managed dimension (skills / MCP / instructions).
 *
 * Mirrors `@deepseek-ai/dsh-agent-instructions` discovery so the panel lists
 * EXACTLY the files the harness will read into every session:
 *   - user-global: `$DSH_HOME/AGENTS.md` (a single hardcoded name — the other
 *     candidates are NOT read at this scope);
 *   - project: `<dir>/AGENTS.md`, `<dir>/CLAUDE.md`, `<dir>/AGENTS.local.md`,
 *     `<dir>/CLAUDE.local.md` for every directory from the project root (the
 *     nearest `.git` marker walking up from cwd) down to cwd.
 *
 * There is deliberately no enable/disable: the harness selects by filename, so
 * renaming a file is not a toggle, it is a semantic change (and a git-visible
 * delete + add). The panel only views, edits, creates and deletes.
 * @module
 */

import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

/** Basenames the harness reads in a project directory (both are read if present). */
export const INSTRUCTION_FILES: readonly string[] = ['AGENTS.md', 'CLAUDE.md']

/** Personal-override basenames, read after the pair above in the same directory. */
export const LOCAL_INSTRUCTION_FILES: readonly string[] = ['AGENTS.local.md', 'CLAUDE.local.md']

/** Marker that ends the upward search for the project root. */
export const PROJECT_ROOT_MARKERS: readonly string[] = ['.git']

/** The only instruction basename the harness reads at the user-global scope. */
export const USER_GLOBAL_FILE = 'AGENTS.md'

/** Mirrors the harness `maxSourceBytes` default: larger files are ignored there. */
const MAX_SOURCE_BYTES = 1024 * 1024

/** Cap on one edit round-tripped through the browser. */
const MAX_EDIT_BYTES = 512 * 1024

/** One addressable instruction-file seat (existing or still to be created). */
export interface InstructionSlot {
  /** Which harness scope this seat belongs to. */
  scope: 'user-global' | 'project'
  /** `user-global` for the home file, otherwise the project-root-relative dir ('' = root). */
  dir: string
  /** Path shown in the session prompt (`~/.dsh/AGENTS.md` or root-relative). */
  displayPath: string
  /** Basename (one of the four supported candidates). */
  name: string
  /** Absolute path on disk. */
  path: string
  exists: boolean
  /** Byte size (0 when absent). */
  bytes: number
  /** ISO mtime ('' when absent). */
  mtime: string
  /** True for the `.local.md` personal-override candidates. */
  local: boolean
  /** True when the file is larger than what the harness will read. */
  oversize: boolean
}

/** One instruction file with its body, for the editor. */
export interface InstructionDetail {
  path: string
  displayPath: string
  content: string
  bytes: number
  /** True when the body was clipped to the edit cap. */
  truncated: boolean
}

/** Resolve the harness home (`$DSH_HOME` when set, else `~/.dsh`). */
function dshHomeDir(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/**
 * Walk up from `cwd` to the nearest project-root marker (the harness rule).
 * @param cwd - absolute session working directory.
 * @returns the project root, or the filesystem root when no marker exists.
 */
export function findProjectRoot(cwd: string): string {
  let dir = resolve(cwd)
  for (;;) {
    for (const marker of PROJECT_ROOT_MARKERS) if (existsSync(join(dir, marker))) return dir
    const parent = dirname(dir)
    if (parent === dir) return dir
    dir = parent
  }
}

/**
 * List `root → cwd`, inclusive — the harness's model-precedence order
 * (broadest first, most specific last).
 * @param root - project root.
 * @param cwd - absolute session working directory.
 * @returns directories from the root down to cwd.
 */
export function ancestorChain(root: string, cwd: string): string[] {
  const chain: string[] = []
  const resolvedRoot = resolve(root)
  let current = resolve(cwd)
  for (;;) {
    chain.push(current)
    if (current === resolvedRoot) break
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }
  return chain.reverse()
}

/** Describe one seat, reading its stat when present. */
function describe(scope: InstructionSlot['scope'], dir: string, displayPath: string, name: string, path: string): InstructionSlot {
  const local = LOCAL_INSTRUCTION_FILES.includes(name)
  let bytes = 0
  let mtime = ''
  let exists = false
  try {
    const info = statSync(path)
    if (info.isFile()) {
      exists = true
      bytes = info.size
      mtime = info.mtime.toISOString()
    }
  } catch {
    exists = false
  }
  return { scope, dir, displayPath, name, path, exists, bytes, mtime, local, oversize: bytes > MAX_SOURCE_BYTES }
}

/**
 * Every instruction seat the harness would consider for one session.
 * @param cwd - session working directory; empty means user-global seats only.
 * @returns user-global first, then project directories root → cwd.
 */
export function listInstructions(cwd?: string): InstructionSlot[] {
  const dshHome = dshHomeDir()
  const globalPath = join(dshHome, USER_GLOBAL_FILE)
  const slots: InstructionSlot[] = [
    describe('user-global', 'user-global', `~/.dsh/${USER_GLOBAL_FILE}`, USER_GLOBAL_FILE, globalPath),
  ]
  const workspace = (cwd ?? '').trim()
  if (workspace === '') return slots
  const root = findProjectRoot(workspace)
  for (const dir of ancestorChain(root, workspace)) {
    const relativeDir = dir === root ? '' : dir.slice(root.length + 1).split('\\').join('/')
    const displayDir = relativeDir === '' ? '' : `${relativeDir}/`
    for (const name of [...INSTRUCTION_FILES, ...LOCAL_INSTRUCTION_FILES]) {
      slots.push(describe('project', relativeDir, `${displayDir}${name}`, name, join(dir, name)))
    }
  }
  return slots
}

/**
 * Resolve one seat, refusing anything the panel did not list for this cwd.
 * This is the security boundary: mutations may only touch whitelisted
 * basenames inside the harness home or the caller's own project chain.
 * @param path - absolute path from the browser.
 * @param cwd - the same session working directory the list used.
 * @returns the matching seat.
 * @throws when the path is not one of the seats for this cwd.
 */
export function resolveSlot(path: string, cwd?: string): InstructionSlot {
  const wanted = resolve(path)
  const found = listInstructions(cwd).find((slot) => slot.path === wanted)
  if (found === undefined) throw new Error('instruction file is outside the managed seats for this workspace')
  return found
}

/**
 * Read one instruction body.
 * @param path - absolute path from the browser.
 * @param cwd - session working directory used for the seat check.
 * @returns the seat plus its body.
 */
export function readInstruction(path: string, cwd?: string): InstructionDetail {
  const slot = resolveSlot(path, cwd)
  if (!slot.exists) throw new Error(`instruction file does not exist: ${slot.displayPath}`)
  const raw = readFileSync(slot.path)
  const clipped = raw.subarray(0, MAX_EDIT_BYTES)
  return {
    path: slot.path,
    displayPath: slot.displayPath,
    content: clipped.toString('utf8'),
    bytes: raw.byteLength,
    truncated: raw.byteLength > clipped.byteLength,
  }
}

/**
 * Create or overwrite one instruction file (creating its directory when needed).
 * @param path - absolute path from the browser.
 * @param content - exact UTF-8 body to write.
 * @param cwd - session working directory used for the seat check.
 * @returns the refreshed seat.
 */
export function writeInstruction(path: string, content: string, cwd?: string): InstructionSlot {
  const slot = resolveSlot(path, cwd)
  if (Buffer.byteLength(content, 'utf8') > MAX_EDIT_BYTES) throw new Error(`instruction body exceeds ${MAX_EDIT_BYTES} bytes`)
  mkdirSync(dirname(slot.path), { recursive: true })
  writeFileSync(slot.path, content, 'utf8')
  return describe(slot.scope, slot.dir, slot.displayPath, slot.name, slot.path)
}

/**
 * Delete one instruction file (physical; the panel confirms twice).
 * @param path - absolute path from the browser.
 * @param cwd - session working directory used for the seat check.
 * @returns the seat that was removed.
 */
export function deleteInstruction(path: string, cwd?: string): InstructionSlot {
  const slot = resolveSlot(path, cwd)
  if (!slot.exists) throw new Error(`instruction file does not exist: ${slot.displayPath}`)
  rmSync(slot.path, { force: true })
  return { ...slot, exists: false, bytes: 0, mtime: '' }
}

/** Basename of an instruction seat (kept exported for diagnostics/tests). */
export function instructionBasename(path: string): string {
  return basename(path)
}
