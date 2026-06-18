import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { validate } from '../middleware/validate.js';
import {
  upsertEmbedding, deleteEmbeddingsForSource, searchSimilar, generateEmbedding,
} from '../data/knowledgeEmbeddings.js';

const router = Router();
router.use(extractMultiTenant);

const SOURCE_TYPES = ['knowledge_article','canned_response','conversation','custom'] as const;

const UpsertSchema = z.object({
  source_type:  z.enum(SOURCE_TYPES),
  source_id:    z.string().uuid(),
  chunk_index:  z.number().int().default(0),
  chunk_text:   z.string().min(1),
  embedding:    z.array(z.number()).length(1536).optional(),
  model:        z.string().optional(),
  metadata:     z.record(z.string(), z.unknown()).default({}),
});

const SearchSchema = z.object({
  query:       z.string().min(1),
  limit:       z.number().int().min(1).max(20).default(5),
  threshold:   z.number().min(0).max(1).default(0.7),
  source_type: z.enum(SOURCE_TYPES).optional(),
});

const DeleteSchema = z.object({
  source_type: z.enum(SOURCE_TYPES),
  source_id:   z.string().uuid(),
});

// POST /api/knowledge-embeddings/upsert
router.post('/upsert', validate({ body: UpsertSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      // Generate embedding if not provided
      let embedding: number[] = req.body.embedding;
      if (!embedding || embedding.length === 0) {
        embedding = await generateEmbedding(req.body.chunk_text);
      }
      const result = await upsertEmbedding(scope, { ...req.body, embedding });
      res.status(201).json(result);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// POST /api/knowledge-embeddings/search  — semantic search
router.post('/search', validate({ body: SearchSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const queryEmbedding = await generateEmbedding(req.body.query);
      const results = await searchSimilar(scope, queryEmbedding, {
        limit:      req.body.limit,
        threshold:  req.body.threshold,
        sourceType: req.body.source_type,
      });
      res.json(results);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

// DELETE /api/knowledge-embeddings  — delete all embeddings for a source
router.delete('/', validate({ body: DeleteSchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      await deleteEmbeddingsForSource(scope, req.body.source_type, req.body.source_id);
      res.status(204).send();
    } catch (err) { console.error(err); res.status(500).json({ error: 'Internal server error' }); }
  });

export default router;
