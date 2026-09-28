/**
 * Browser-side API client for the /api/dsh-skills-mcp route family. The only
 * data path the card components use — plain fetch, same origin.
 */

import { SKILLS_MCP_API } from '../protocol.ts'
import type { ImportItem, ImportResult, InstructionDetail, InstructionSlot, McpServerConfig, McpServerSummary, ScannedSkill, SkillDetail, SkillSummary } from '../protocol.ts'

/** Error carrying the route's JSON error message. */
export class SkillsMcpApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkillsMcpApiError'
  }
}

async function readJson<T>(response: Response): Promise<T> {
  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new SkillsMcpApiError('HTTP ' + response.status + ': invalid JSON response')
  }
  if (!response.ok) {
    const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : 'HTTP ' + response.status
    throw new SkillsMcpApiError(message)
  }
  return body as T
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return readJson<T>(response)
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path)
  return readJson<T>(response)
}

/** Resolved project scope reported alongside a listing. */
export interface ProjectScopeInfo {
  /** Project root the panel resolved: the `.git` directory, or the session cwd itself. */
  projectRoot: string
  /** True when a `.git` marker (not the cwd fallback) decided the root. */
  markerFound: boolean
}

/** The browser half's only data entry point. */
export class SkillsMcpApi {
  async listSkills(cwd: string): Promise<{ items: SkillSummary[] } & ProjectScopeInfo> {
    const q = cwd ? '?cwd=' + encodeURIComponent(cwd) : ''
    const body = await get<{ ok: boolean; items: SkillSummary[]; projectRoot?: string; markerFound?: boolean }>(SKILLS_MCP_API.skills + q)
    return { items: body.items, projectRoot: body.projectRoot ?? '', markerFound: body.markerFound ?? false }
  }

  async readSkill(path: string): Promise<SkillDetail> {
    const body = await post<{ ok: boolean; skill: SkillDetail }>(SKILLS_MCP_API.skillRead, { path })
    return body.skill
  }

  async toggleSkill(path: string, enabled: boolean): Promise<void> {
    await post<{ ok: boolean }>(SKILLS_MCP_API.skillToggle, { path, enabled })
  }

  async deleteSkill(path: string, kind: 'bundle' | 'file'): Promise<void> {
    await post<{ ok: boolean }>(SKILLS_MCP_API.skillDelete, { path, kind })
  }

  async scanSkills(dir: string): Promise<ScannedSkill[]> {
    const body = await post<{ ok: boolean; items: ScannedSkill[] }>(SKILLS_MCP_API.skillScan, { dir })
    return body.items
  }

  async importSkills(items: ImportItem[]): Promise<ImportResult[]> {
    const body = await post<{ ok: boolean; results: ImportResult[] }>(SKILLS_MCP_API.skillImport, { items })
    return body.results
  }

  async listMcp(): Promise<McpServerSummary[]> {
    const body = await get<{ ok: boolean; servers: McpServerSummary[] }>(SKILLS_MCP_API.mcp)
    return body.servers
  }

  async saveMcp(server: McpServerConfig): Promise<void> {
    await post<{ ok: boolean }>(SKILLS_MCP_API.mcpSave, { server })
  }

  async setMcpEnabled(name: string, enabled: boolean): Promise<void> {
    await post<{ ok: boolean }>(SKILLS_MCP_API.mcpEnabled, { name, enabled })
  }

  async deleteMcp(name: string): Promise<void> {
    await post<{ ok: boolean }>(SKILLS_MCP_API.mcpDelete, { name })
  }

  async testMcp(server: McpServerConfig): Promise<{ ok: boolean; error?: string }> {
    const body = await post<{ ok: boolean; test: { ok: boolean; error?: string } }>(SKILLS_MCP_API.mcpTest, { server })
    return body.test
  }

  /** Every instruction-file seat the harness would consider for this workspace. */
  async listInstructions(cwd: string): Promise<{ slots: InstructionSlot[] } & ProjectScopeInfo> {
    const q = cwd ? '?cwd=' + encodeURIComponent(cwd) : ''
    const body = await get<{ ok: boolean; slots: InstructionSlot[]; projectRoot?: string; markerFound?: boolean }>(SKILLS_MCP_API.instructions + q)
    return { slots: body.slots, projectRoot: body.projectRoot ?? '', markerFound: body.markerFound ?? false }
  }

  async readInstruction(path: string, cwd: string): Promise<InstructionDetail> {
    const body = await post<{ ok: boolean; file: InstructionDetail }>(SKILLS_MCP_API.instructionRead, { path, cwd })
    return body.file
  }

  async saveInstruction(path: string, content: string, cwd: string): Promise<InstructionSlot> {
    const body = await post<{ ok: boolean; slot: InstructionSlot }>(SKILLS_MCP_API.instructionSave, { path, content, cwd })
    return body.slot
  }

  async deleteInstruction(path: string, cwd: string): Promise<void> {
    await post<{ ok: boolean }>(SKILLS_MCP_API.instructionDelete, { path, cwd })
  }
}
