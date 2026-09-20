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
/** Basenames the harness reads in a project directory (both are read if present). */
export declare const INSTRUCTION_FILES: readonly string[];
/** Personal-override basenames, read after the pair above in the same directory. */
export declare const LOCAL_INSTRUCTION_FILES: readonly string[];
/** Marker that ends the upward search for the project root. */
export declare const PROJECT_ROOT_MARKERS: readonly string[];
/** The only instruction basename the harness reads at the user-global scope. */
export declare const USER_GLOBAL_FILE = "AGENTS.md";
/** One addressable instruction-file seat (existing or still to be created). */
export interface InstructionSlot {
    /** Which harness scope this seat belongs to. */
    scope: 'user-global' | 'project';
    /** `user-global` for the home file, otherwise the project-root-relative dir ('' = root). */
    dir: string;
    /** Path shown in the session prompt (`~/.dsh/AGENTS.md` or root-relative). */
    displayPath: string;
    /** Basename (one of the four supported candidates). */
    name: string;
    /** Absolute path on disk. */
    path: string;
    exists: boolean;
    /** Byte size (0 when absent). */
    bytes: number;
    /** ISO mtime ('' when absent). */
    mtime: string;
    /** True for the `.local.md` personal-override candidates. */
    local: boolean;
    /** True when the file is larger than what the harness will read. */
    oversize: boolean;
}
/** One instruction file with its body, for the editor. */
export interface InstructionDetail {
    path: string;
    displayPath: string;
    content: string;
    bytes: number;
    /** True when the body was clipped to the edit cap. */
    truncated: boolean;
}
/**
 * Walk up from `cwd` to the nearest project-root marker (the harness rule).
 * @param cwd - absolute session working directory.
 * @returns the project root, or the filesystem root when no marker exists.
 */
export declare function findProjectRoot(cwd: string): string;
/**
 * List `root → cwd`, inclusive — the harness's model-precedence order
 * (broadest first, most specific last).
 * @param root - project root.
 * @param cwd - absolute session working directory.
 * @returns directories from the root down to cwd.
 */
export declare function ancestorChain(root: string, cwd: string): string[];
/**
 * Every instruction seat the harness would consider for one session.
 * @param cwd - session working directory; empty means user-global seats only.
 * @returns user-global first, then project directories root → cwd.
 */
export declare function listInstructions(cwd?: string): InstructionSlot[];
/**
 * Resolve one seat, refusing anything the panel did not list for this cwd.
 * This is the security boundary: mutations may only touch whitelisted
 * basenames inside the harness home or the caller's own project chain.
 * @param path - absolute path from the browser.
 * @param cwd - the same session working directory the list used.
 * @returns the matching seat.
 * @throws when the path is not one of the seats for this cwd.
 */
export declare function resolveSlot(path: string, cwd?: string): InstructionSlot;
/**
 * Read one instruction body.
 * @param path - absolute path from the browser.
 * @param cwd - session working directory used for the seat check.
 * @returns the seat plus its body.
 */
export declare function readInstruction(path: string, cwd?: string): InstructionDetail;
/**
 * Create or overwrite one instruction file (creating its directory when needed).
 * @param path - absolute path from the browser.
 * @param content - exact UTF-8 body to write.
 * @param cwd - session working directory used for the seat check.
 * @returns the refreshed seat.
 */
export declare function writeInstruction(path: string, content: string, cwd?: string): InstructionSlot;
/**
 * Delete one instruction file (physical; the panel confirms twice).
 * @param path - absolute path from the browser.
 * @param cwd - session working directory used for the seat check.
 * @returns the seat that was removed.
 */
export declare function deleteInstruction(path: string, cwd?: string): InstructionSlot;
/** Basename of an instruction seat (kept exported for diagnostics/tests). */
export declare function instructionBasename(path: string): string;
//# sourceMappingURL=instructions.d.ts.map