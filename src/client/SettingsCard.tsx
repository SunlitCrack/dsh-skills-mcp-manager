/**
 * The skills-mcp-manager settings section: a first-class settings page (a
 * `settings.section` entry, a sibling of the Plugins page) that renders the
 * skills/MCP management UI directly. The plugin does NOT read its own settings
 * namespace (third-party namespaces are not exposed to the browser settings
 * surface), so there is no master-switch here; the manager is always shown.
 */

import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { SkillsMcpManager } from './manager.tsx'
import css from './settings-card.module.css'

/** Props the renderer binds for the section. */
export type SkillsMcpSectionProps =
  PropsRuntime<'settings.section'>
  & PropsLocale<'skills-mcp-manager'>
  & InjectFace<{ pickDirectory: () => Promise<string | null> }>

/** The Session summary fields this page reads (kernel store shape). */
interface SessionSummaryLike {
  cwd?: string
  /** Main-view retention counter: > 0 marks the Session the user is looking at. */
  retainedBy?: { mainView?: number }
}

/** Session list snapshot the kernel's `useSessions` hook selects from. */
interface SessionsSnapshotLike {
  byId?: Record<string, SessionSummaryLike | undefined>
}

/**
 * The Session id the kernel persists as "current" (`dsh.sessions.current`, a
 * `createSnapshotStore` persisted under that name). Second opinion only — the
 * main-view Session below is the authoritative one.
 * @returns the persisted id, or '' when absent/unreadable.
 */
function persistedSessionId(): string {
  try {
    const storage = globalThis.localStorage
    if (storage === undefined) return ''
    const raw = storage.getItem('dsh.sessions.current')
    if (raw === null || raw === '') return ''
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return ''
    const id = (parsed as { sessionId?: unknown }).sessionId
    return typeof id === 'string' ? id : ''
  } catch {
    // A missing or foreign value only means "no persisted selection".
    return ''
  }
}

/**
 * Render the settings section content.
 * @param props - locale copy, the shell's close action, and the picker helper.
 * @returns the section page.
 */
export function SkillsMcpSection(props: SkillsMcpSectionProps) {
  const { t } = props

  // 项目目录的三级来源，全部取自内核自己的 store，不猜字段：
  //   1. 主视图会话：`retainedBy.mainView > 0`（内核 dsh-client-ui-cordis 同款读法）；
  //   2. 内核持久化的「当前会话」`dsh.sessions.current` → 该会话的 cwd；
  //   3. 兜底：第一个工作区路径（面板会把它显示出来，猜错一眼可辨）。
  // ⚠️ 0.1.7 的 sessions store 形状是 { byId }，**没有 current 字段**。旧写法读 s.current
  //    恒为空 → 永远落到第 3 级（= 第一个工作区），这正是「切到 inf-k8s 后仍显示上一个目录」的原因。
  const hooks = props as unknown as {
    useSessions?: <T>(selector: (snapshot: SessionsSnapshotLike) => T) => T
  }
  const mainCwd = hooks.useSessions !== undefined
    ? hooks.useSessions((s) => {
        const byId = s?.byId ?? {}
        for (const summary of Object.values(byId)) {
          if (summary !== undefined && (summary.retainedBy?.mainView ?? 0) > 0) return summary.cwd ?? ''
        }
        return ''
      })
    : ''

  const selectedId = persistedSessionId()
  const selectedCwd = hooks.useSessions !== undefined
    ? hooks.useSessions((s) => (selectedId === '' ? '' : (s?.byId?.[selectedId]?.cwd ?? '')))
    : ''

  const workspaceCwd = props.useWorkspaces((s) => {
    const items = (s && s.items) || []
    return items.length > 0 ? (items[0].path || '') : ''
  })
  const autoCwd = mainCwd || selectedCwd || workspaceCwd
  const autoSource = mainCwd !== ''
    ? '当前会话'
    : selectedCwd !== ''
      ? '已选会话'
      : workspaceCwd !== ''
        ? '首个工作区（未取到会话）'
        : '未识别'

  return (
    <div className={css.sectionPage}>
      <h2 className={css.pageHeading}>{t('title')}</h2>
      <p className={css.pageIntro}>{t('description')}</p>
      <SkillsMcpManager
        autoCwd={autoCwd}
        autoSource={autoSource}
        enabled={true}
        pickDirectory={props.pickDirectory}
      />
    </div>
  )
}
