/**
 * The skills + MCP management UI rendered inside the settings card. Pure
 * React (no framework services): every data access goes through SkillsMcpApi,
 * which fetches the /api/dsh-skills-mcp routes. Inline Chinese copy mirrors
 * the original dynamic plugin; the card chrome above stays bilingual.
 */
/** Where the effective project directory came from, plus the manual override. */
export interface ManagerProps {
    /** Auto-detected project directory (main-view session cwd → selected session → first workspace). */
    autoCwd: string;
    /** Human label for how {@link autoCwd} was obtained. */
    autoSource: string;
    enabled: boolean;
    pickDirectory: () => Promise<string | null>;
}
/** Top-level manager with the Skills / MCP / instructions tabs. */
export declare function SkillsMcpManager(props: ManagerProps): import("react").JSX.Element;
//# sourceMappingURL=manager.d.ts.map