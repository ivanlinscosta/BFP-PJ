import { Router } from 'express';
import { z } from 'zod';
import { DNA_DIMENSIONS, OUTCOME_STATUSES } from '@bfp/customer-intelligence';
import { createVerifyJwtMiddleware } from '@api/auth/verifyJwt';
import { parseWithZod } from '@api/common/validation';
import type { ApiContext } from '@api/http/context';
import {
  clusterIntelligence,
  explainRecommendation,
  findRecommendation,
  findSimilarCustomers,
  getCustomerIntelligence,
  getProfileOrThrow,
  recordOutcome,
} from '@api/services/customerIntelligence/service';

const outcomeSchema = z.object({
  status: z.enum(OUTCOME_STATUSES),
  channel: z.string().trim().max(60).optional(),
  reason: z.string().trim().max(300).optional(),
  value: z.number().finite().optional(),
});

const clusterSchema = z.object({
  customerIds: z.array(z.string().trim().min(1)).max(20_000).optional(),
  filters: z
    .object({
      segment: z.string().trim().optional(),
      industry: z.string().trim().optional(),
      companySize: z.string().trim().optional(),
      state: z.string().trim().length(2).optional(),
      region: z.string().trim().optional(),
      topActionId: z.string().trim().optional(),
      signalType: z.string().trim().optional(),
      minDna: z
        .object(
          Object.fromEntries(
            DNA_DIMENSIONS.map((id) => [id, z.number().min(0).max(100).optional()]),
          ),
        )
        .optional(),
    })
    .optional(),
});

const similarSchema = z.object({
  customerId: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * Customer Intelligence API: Cliente PJ 360 + DNA + signals + Next Best Action, outcomes,
 * explanations, clusters and similar customers. Profiles come from the materialized read model.
 */
export function createCustomerIntelligenceRouter(context: ApiContext) {
  const router = Router();
  const verifyJwt = createVerifyJwtMiddleware(context.config);

  router.get('/customers/:id/intelligence', verifyJwt, async (req, res, next) => {
    try {
      const { profile, outcomes } = await getCustomerIntelligence(context, String(req.params.id));
      context.logger.info('NBA_VIEWED', {
        operation: 'NBA_VIEWED',
        userId: req.auth!.userId,
        customerId: profile.customerId,
        actionId: profile.recommendations[0]?.actionId,
        modelVersion: profile.modelVersion,
      });
      res.json({
        customer: profile.identity,
        tenureMonths: profile.tenureMonths,
        dna: profile.dna,
        changes: profile.changes,
        signals: profile.signals,
        recommendations: profile.recommendations,
        readingShift: profile.readingShift,
        tabs: profile.tabs,
        similar: profile.similar,
        outcomes,
        updatedAt: profile.updatedAt,
        dataQuality: profile.dataQuality,
        dnaVersion: profile.dnaVersion,
        modelVersion: profile.modelVersion,
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/customers/:id/dna', verifyJwt, async (req, res, next) => {
    try {
      const profile = await getProfileOrThrow(context, String(req.params.id));
      res.json({ dna: profile.dna });
    } catch (error) {
      next(error);
    }
  });

  router.get('/customers/:id/signals', verifyJwt, async (req, res, next) => {
    try {
      const profile = await getProfileOrThrow(context, String(req.params.id));
      res.json({ items: profile.signals });
    } catch (error) {
      next(error);
    }
  });

  router.get('/customers/:id/recommendations', verifyJwt, async (req, res, next) => {
    try {
      const profile = await getProfileOrThrow(context, String(req.params.id));
      res.json({ items: profile.recommendations, modelVersion: profile.modelVersion });
    } catch (error) {
      next(error);
    }
  });

  router.post('/customers/similar', verifyJwt, async (req, res, next) => {
    try {
      const payload = parseWithZod(similarSchema, req.body, {
        message: 'Pedido de semelhantes inválido.',
      });
      res.json(await findSimilarCustomers(context, payload.customerId, payload.limit));
    } catch (error) {
      next(error);
    }
  });

  router.post('/recommendations/:id/outcomes', verifyJwt, async (req, res, next) => {
    try {
      const payload = parseWithZod(outcomeSchema, req.body, {
        message: 'Resultado da recomendação inválido.',
      });
      const { recommendation } = await findRecommendation(context, String(req.params.id));
      res
        .status(201)
        .json({ outcome: await recordOutcome(context, req.auth!, recommendation, payload) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/recommendations/:id/explain', verifyJwt, async (req, res, next) => {
    try {
      const { profile, recommendation } = await findRecommendation(context, String(req.params.id));
      res.json({ explanation: await explainRecommendation(context, profile, recommendation) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/clusters/intelligence', verifyJwt, async (req, res, next) => {
    try {
      const payload = parseWithZod(clusterSchema, req.body, {
        message: 'Definição de grupo inválida.',
      });
      res.json({ cluster: await clusterIntelligence(context, payload) });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
