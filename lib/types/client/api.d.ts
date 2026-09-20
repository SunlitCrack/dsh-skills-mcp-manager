/**
 * Browser-side API client for the /api/dsh-skills-mcp route family. The only
 * data path the card components use — plain fetch, same origin.
 */
import type { ImportItem, ImportResult, InstructionDetail, InstructionSlot, McpServerConfig, McpServerSummary, ScannedSkill, SkillDetail, SkillSummary } from '../protocol.ts';
/** Error carrying the route's JSON error message. */
export declare class SkillsMcpApiError extends Error {
    constructor(message: string);
}
/** The browser half's only data entry point. */
export declare class SkillsMcpApi {
    listSkills(cwd: string): Promise<SkillSummary[]>;
    readSkill(path: string): Promise<SkillDetail>;
    toggleSkill(path: string, enabled: boolean): Promise<void>;
    deleteSkill(path: string, kind: 'bundle' | 'file'): Promise<void>;
    scanSkills(dir: string): Promise<ScannedSkill[]>;
    importSkills(items: ImportItem[]): Promise<ImportResult[]>;
    listMcp(): Promise<McpServerSummary[]>;
    saveMcp(server: McpServerConfig): Promise<void>;
    setMcpEnabled(name: string, enabled: boolean): Promise<void>;
    deleteMcp(name: string): Promise<void>;
    testMcp(server: McpServerConfig): Promise<{
        ok: boolean;
        error?: string;
    }>;
    /** Every instruction-file seat the harness would consider for this workspace. */
    listInstructions(cwd: string): Promise<InstructionSlot[]>;
    readInstruction(path: string, cwd: string): Promise<InstructionDetail>;
    saveInstruction(path: string, content: string, cwd: string): Promise<InstructionSlot>;
    deleteInstruction(path: string, cwd: string): Promise<void>;
}
//# sourceMappingURL=api.d.ts.map