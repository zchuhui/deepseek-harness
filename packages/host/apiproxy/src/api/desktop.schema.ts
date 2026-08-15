/**
 * desktop domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** desktop.getSettings request payload (empty object literal). */
export const desktopGetSettingsRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'desktop.getSettings'>>>

/** desktop.setSettings request payload: a partial settings document; omitted fields keep their values. */
export const desktopSetSettingsRequestSchema = z.object({
  closeToTray: z.boolean().optional(),
  launchAtLogin: z.boolean().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'desktop.setSettings'>>>

/** Shared settings value: both settings methods answer the complete document. */
const desktopSettingsValueSchema = z.object({
  closeToTray: z.boolean(),
  launchAtLogin: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'desktop.getSettings'>>>

/** desktop.getSettings response value. */
export const desktopGetSettingsValueSchema = desktopSettingsValueSchema

/** desktop.setSettings response value (the complete document, same as getSettings). */
export const desktopSetSettingsValueSchema = desktopSettingsValueSchema
