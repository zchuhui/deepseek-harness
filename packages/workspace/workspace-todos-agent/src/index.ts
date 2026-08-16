/**
 * Agent-facing workspace-todos integration: per-agent `todos_read` and
 * `todos_update` tools gated by the deployment-configured approval policy —
 * create and content-edit calls always ask a human, set-status calls follow
 * the configured policy.
 * @module @deepseek-ai/dsh-workspace-todos-agent
 */

import type { Context } from '@deepseek-ai/cordis'
import s from '@deepseek-ai/schemastery'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace'
// Type-only: brings the `ctx.workspaceTodos` Context augmentation into scope.
import type {} from '@deepseek-ai/dsh-workspace-todos'
import { registerTodosTools } from './tools.ts'
import type { TodosStatusApprovalPolicy } from './types.ts'

export type * from './types.ts'
export { registerTodosTools } from './tools.ts'

/** Cordis function-plugin name. */
export const name = 'workspace-todos-agent'
/** Services the integration composes over. */
export const inject = ['tools', 'workspaceTodos', 'workspaceRegistry']

/**
 * Deployment policy for the todos agent integration: create and content-edit
 * calls always ask a human before they commit; `statusUpdateApproval` decides
 * whether set-status calls on existing todos ask too.
 */
export interface Config {
  readonly statusUpdateApproval: TodosStatusApprovalPolicy
}

/** Schemastery configuration for the todos agent integration. */
export const Config: s<Config> = s.object({
  statusUpdateApproval: s.union(['ask', 'allow'] as const).required(),
})

/**
 * Compose the integration onto every future agent. Attachment is resolved
 * lazily at each pre-step: the product create flow announces an agent before
 * its session joins a workspace, so a session may gain (or never gain) a
 * workspace after `agent/created`. Once a registered workspace accounts for
 * the session, the tools with their approval gate go live on the agent's
 * scope; sessions without a workspace expose none of them.
 * @param ctx - registrant context.
 * @param config - deployment approval policy.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('agent/created', ({ agent }) => {
    agent.ctx.effect(() => {
      let integration: (() => void) | undefined
      let workspaceId: WorkspaceId | undefined
      const disposePreStep = agent.ctx.on('agent/pre-step', async (_step, next) => {
        if (workspaceId === undefined) {
          const workspace = ctx.workspaceRegistry.resolveBySession(agent.id)
          if (workspace === undefined) return await next()
          workspaceId = workspace.id
          integration = registerTodosTools(ctx, agent.ctx, workspaceId, config.statusUpdateApproval)
        }
        return await next()
      })
      return () => {
        integration?.()
        disposePreStep()
      }
    }, 'workspace-todos-agent.attach()')
  })
}
