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

/**
 * Render the settings section content.
 * @param props - locale copy, the shell's close action, and the picker helper.
 * @returns the section page.
 */
export function SkillsMcpSection(props: SkillsMcpSectionProps) {
  const { t } = props

  // Current project path → project-level skills root.
  // 优先取「当前会话的 cwd」：会话就建在工作区目录里，那才是你正在用的项目。
  // 不能按 s.recentWorkspaceId 找：内核（Desktop 2.0.11 / 0.1.5-rc.2）的工作区快照里没有这个字段，
  // 原写法会静默退化成 items[0]（= 第一个注册的工作区），于是项目级技能永远扫的不是当前目录。
  const hooks = props as unknown as {
    useSessions?: <T>(selector: (snapshot: {
      current?: string
      byId?: Record<string, { cwd?: string } | undefined>
    }) => T) => T
  }
  const sessionCwd = hooks.useSessions !== undefined
    ? hooks.useSessions((s) => {
        const current = s.current
        const summary = current === undefined ? undefined : (s.byId ?? {})[current]
        return (summary && summary.cwd) || ''
      })
    : ''
  const workspaceCwd = props.useWorkspaces((s) => {
    const items = (s && s.items) || []
    return items.length > 0 ? (items[0].path || '') : ''
  })
  const cwd = sessionCwd || workspaceCwd

  return (
    <div className={css.sectionPage}>
      <h2 className={css.pageHeading}>{t('title')}</h2>
      <p className={css.pageIntro}>{t('description')}</p>
      <SkillsMcpManager cwd={cwd} enabled={true} pickDirectory={props.pickDirectory} />
    </div>
  )
}
