import { Router } from 'express';
import { z } from 'zod';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';

/** Product events the web app may record (closed list: nothing free-form is logged). */
export const PRODUCT_EVENTS = [
  'VISUALIZATION_DROPDOWN_OPENED',
  'VISUALIZATION_SELECTED',
  'AUTO_VISUALIZATION_SELECTED',
  'VISUALIZATION_RECOMMENDATION_ACCEPTED',
  'VISUALIZATION_INCOMPATIBLE_ATTEMPT',
] as const;

const token = z
  .string()
  .trim()
  .max(40)
  .regex(/^[A-Z0-9_:.-]*$/i);
const eventSchema = z.object({
  name: z.enum(PRODUCT_EVENTS),
  properties: z
    .object({
      previousType: token.optional(),
      type: token.optional(),
      mode: z.enum(['AUTO', 'MANUAL']).optional(),
      surface: z.enum(['explorer', 'dashboard', 'chat']).optional(),
      /** Shape of the analysis without values ("RATE" metrics, "CATEGORY:7" dimensions). */
      shape: z
        .object({
          metrics: z.array(token).max(10),
          dimensions: z.array(token).max(10),
        })
        .optional(),
      rank: z.number().int().min(0).max(40).optional(),
    })
    .strict()
    .default({}),
});

/** POST /telemetry: product analytics of the UI as structured logs (no PII, no free text). */
export function createTelemetryRouter(context: ApiContext) {
  const router = Router();
  router.use(createVerifyJwtMiddleware(context.config));
  router.post('/', (req, res, next) => {
    try {
      const event = parseWithZod(eventSchema, req.body ?? {}, {
        message: 'Evento de telemetria inválido.',
      });
      context.logger.info('product_event', {
        operation: event.name,
        userId: req.auth!.userId,
        ...event.properties,
      });
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  return router;
}
