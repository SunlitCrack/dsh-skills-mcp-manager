import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
//#region src/instructions.ts
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
const INSTRUCTION_FILES = ["AGENTS.md", "CLAUDE.md"];
/** Personal-override basenames, read after the pair above in the same directory. */
const LOCAL_INSTRUCTION_FILES = ["AGENTS.local.md", "CLAUDE.local.md"];
/** Marker that ends the upward search for the project root. */
const PROJECT_ROOT_MARKERS = [".git"];
/** The only instruction basename the harness reads at the user-global scope. */
const USER_GLOBAL_FILE = "AGENTS.md";
/** Mirrors the harness `maxSourceBytes` default: larger files are ignored there. */
const MAX_SOURCE_BYTES = 1024 * 1024;
/** Cap on one edit round-tripped through the browser. */
const MAX_EDIT_BYTES = 512 * 1024;
/** Resolve the harness home (`$DSH_HOME` when set, else `~/.dsh`). */
function dshHomeDir() {
	return process.env.DSH_HOME || join(homedir(), ".dsh");
}
/**
* Walk up from `cwd` to the nearest project-root marker — the harness rule.
*
* When nothing is found all the way up, the harness takes **cwd itself** as the
* project root (`dsh-agent-instructions`: "the discovered project root, or `cwd`
* when no marker exists"), so a session outside any checkout reads only its own
* directory. Returning the filesystem root instead would make the panel list
* every ancestor directory up to the drive root — the bug this replaces.
* @param cwd - absolute session working directory.
* @returns the resolved scope and whether a marker decided it.
*/
function resolveProjectScope(cwd) {
	const start = resolve(cwd);
	let dir = start;
	for (;;) {
		for (const marker of PROJECT_ROOT_MARKERS) if (existsSync(join(dir, marker))) return {
			root: dir,
			markerFound: true
		};
		const parent = dirname(dir);
		if (parent === dir) return {
			root: start,
			markerFound: false
		};
		dir = parent;
	}
}
/**
* Walk up from `cwd` to the nearest project-root marker (the harness rule).
* @param cwd - absolute session working directory.
* @returns the project root, or `cwd` when no marker exists.
*/
function findProjectRoot(cwd) {
	return resolveProjectScope(cwd).root;
}
/**
* The scope a panel request resolved for one session directory.
* @param cwd - session working directory; empty or blank means "no project scope".
* @returns the scope, or undefined when there is no cwd to resolve.
*/
function projectScopeOf(cwd) {
	const workspace = (cwd ?? "").trim();
	return workspace === "" ? void 0 : resolveProjectScope(workspace);
}
/**
* List `root → cwd`, inclusive — the harness's model-precedence order
* (broadest first, most specific last).
* @param root - project root.
* @param cwd - absolute session working directory.
* @returns directories from the root down to cwd.
*/
function ancestorChain(root, cwd) {
	const chain = [];
	const resolvedRoot = resolve(root);
	let current = resolve(cwd);
	for (;;) {
		chain.push(current);
		if (current === resolvedRoot) break;
		const parent = dirname(current);
		if (parent === current) break;
		current = parent;
	}
	return chain.reverse();
}
/** Describe one seat, reading its stat when present. */
function describe(scope, dir, displayPath, name, path) {
	const local = LOCAL_INSTRUCTION_FILES.includes(name);
	let bytes = 0;
	let mtime = "";
	let exists = false;
	try {
		const info = statSync(path);
		if (info.isFile()) {
			exists = true;
			bytes = info.size;
			mtime = info.mtime.toISOString();
		}
	} catch {
		exists = false;
	}
	return {
		scope,
		dir,
		displayPath,
		name,
		path,
		exists,
		bytes,
		mtime,
		local,
		oversize: bytes > MAX_SOURCE_BYTES
	};
}
/**
* Every instruction seat the harness would consider for one session.
* @param cwd - session working directory; empty means user-global seats only.
* @returns user-global first, then project directories root → cwd.
*/
function listInstructions(cwd) {
	const globalPath = join(dshHomeDir(), USER_GLOBAL_FILE);
	const slots = [describe("user-global", "user-global", `~/.dsh/${USER_GLOBAL_FILE}`, USER_GLOBAL_FILE, globalPath)];
	const workspace = (cwd ?? "").trim();
	if (workspace === "") return slots;
	const root = findProjectRoot(workspace);
	for (const dir of ancestorChain(root, workspace)) {
		const relativeDir = dir === root ? "" : relative(root, dir).split("\\").join("/");
		const displayDir = relativeDir === "" ? "" : `${relativeDir}/`;
		for (const name of [...INSTRUCTION_FILES, ...LOCAL_INSTRUCTION_FILES]) slots.push(describe("project", relativeDir, `${displayDir}${name}`, name, join(dir, name)));
	}
	return slots;
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
function resolveSlot(path, cwd) {
	const wanted = resolve(path);
	const found = listInstructions(cwd).find((slot) => slot.path === wanted);
	if (found === void 0) throw new Error("instruction file is outside the managed seats for this workspace");
	return found;
}
/**
* Read one instruction body.
* @param path - absolute path from the browser.
* @param cwd - session working directory used for the seat check.
* @returns the seat plus its body.
*/
function readInstruction(path, cwd) {
	const slot = resolveSlot(path, cwd);
	if (!slot.exists) throw new Error(`instruction file does not exist: ${slot.displayPath}`);
	const raw = readFileSync(slot.path);
	const clipped = raw.subarray(0, MAX_EDIT_BYTES);
	return {
		path: slot.path,
		displayPath: slot.displayPath,
		content: clipped.toString("utf8"),
		bytes: raw.byteLength,
		truncated: raw.byteLength > clipped.byteLength
	};
}
/**
* Create or overwrite one instruction file (creating its directory when needed).
* @param path - absolute path from the browser.
* @param content - exact UTF-8 body to write.
* @param cwd - session working directory used for the seat check.
* @returns the refreshed seat.
*/
function writeInstruction(path, content, cwd) {
	const slot = resolveSlot(path, cwd);
	if (Buffer.byteLength(content, "utf8") > MAX_EDIT_BYTES) throw new Error(`instruction body exceeds ${MAX_EDIT_BYTES} bytes`);
	mkdirSync(dirname(slot.path), { recursive: true });
	writeFileSync(slot.path, content, "utf8");
	return describe(slot.scope, slot.dir, slot.displayPath, slot.name, slot.path);
}
/**
* Delete one instruction file (physical; the panel confirms twice).
* @param path - absolute path from the browser.
* @param cwd - session working directory used for the seat check.
* @returns the seat that was removed.
*/
function deleteInstruction(path, cwd) {
	const slot = resolveSlot(path, cwd);
	if (!slot.exists) throw new Error(`instruction file does not exist: ${slot.displayPath}`);
	rmSync(slot.path, { force: true });
	return {
		...slot,
		exists: false,
		bytes: 0,
		mtime: ""
	};
}
/** Basename of an instruction seat (kept exported for diagnostics/tests). */
function instructionBasename(path) {
	return basename(path);
}
//#endregion
export { INSTRUCTION_FILES, LOCAL_INSTRUCTION_FILES, PROJECT_ROOT_MARKERS, USER_GLOBAL_FILE, ancestorChain, deleteInstruction, findProjectRoot, instructionBasename, listInstructions, projectScopeOf, readInstruction, resolveProjectScope, resolveSlot, writeInstruction };
