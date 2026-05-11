import { Router, Response } from 'express';
import { z } from 'zod';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { requirePermission } from '../middleware/authorization.js';
import { validate } from '../middleware/validate.js';
import { createAuditRepository } from '../data/index.js';
import {
  listCompanies,
  getCompany,
  createCompany,
  updateCompany,
  deleteCompany,
  findCompanyByDomain,
} from '../data/companies.js';

const router = Router();
const auditRepository = createAuditRepository();

router.use(extractMultiTenant);

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateCompanySchema = z.object({
  name:             z.string().min(1, 'Company name is required'),
  domain:           z.string().optional().nullable(),
  description:      z.string().optional().nullable(),
  website:          z.string().url('Invalid website URL').optional().nullable(),
  phone:            z.string().optional().nullable(),
  country:          z.string().optional().nullable(),
  industry:         z.string().optional().nullable(),
  employee_count:   z.number().int().positive().optional().nullable(),
  annual_revenue:   z.number().positive().optional().nullable(),
  currency:         z.string().length(3).default('USD'),
  custom_attributes: z.record(z.string(), z.unknown()).default({}),
});

const UpdateCompanySchema = CreateCompanySchema.partial().omit({ name: true }).extend({
  name: z.string().min(1).optional(),
});

// ── GET /api/companies ────────────────────────────────────────────────────────

router.get('/', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const companies = await listCompanies(scope, {
      q:        typeof req.query.q        === 'string' ? req.query.q        : undefined,
      industry: typeof req.query.industry === 'string' ? req.query.industry : undefined,
      country:  typeof req.query.country  === 'string' ? req.query.country  : undefined,
    });
    res.json(companies);
  } catch (err) {
    console.error('Error listing companies:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/companies/lookup?domain=... ──────────────────────────────────────

router.get('/lookup', async (req: MultiTenantRequest, res: Response) => {
  const domain = typeof req.query.domain === 'string' ? req.query.domain : null;
  if (!domain) return res.status(400).json({ error: 'domain query param required' });

  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const company = await findCompanyByDomain(scope, domain);
    if (!company) return res.status(404).json({ error: 'No company found for that domain' });
    res.json(company);
  } catch (err) {
    console.error('Error looking up company by domain:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/companies/:id ────────────────────────────────────────────────────

router.get('/:id', async (req: MultiTenantRequest, res: Response) => {
  try {
    const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
    const company = await getCompany(scope, req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (err) {
    console.error('Error fetching company:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/companies ───────────────────────────────────────────────────────

router.post(
  '/',
  requirePermission('customers.write'),
  validate({ body: CreateCompanySchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };
      const company = await createCompany(scope, req.body);

      await auditRepository.log(scope, {
        actorId:    req.userId || 'system',
        action:     'COMPANY_CREATED',
        entityType: 'company',
        entityId:   company.id,
        newValue:   { name: company.name, domain: company.domain },
        metadata:   { source: 'companies_api' },
      });

      res.status(201).json(company);
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'A company with that domain already exists' });
      }
      console.error('Error creating company:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── PATCH /api/companies/:id ──────────────────────────────────────────────────

router.patch(
  '/:id',
  requirePermission('customers.write'),
  validate({ body: UpdateCompanySchema }),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };

      const existing = await getCompany(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Company not found' });

      const updated = await updateCompany(scope, req.params.id, req.body);

      await auditRepository.log(scope, {
        actorId:    req.userId || 'system',
        action:     'COMPANY_UPDATED',
        entityType: 'company',
        entityId:   req.params.id,
        oldValue:   { name: existing.name, domain: existing.domain },
        newValue:   req.body,
        metadata:   { source: 'companies_api' },
      });

      res.json(updated ?? { id: req.params.id, ...req.body });
    } catch (err: any) {
      if (err?.code === '23505') {
        return res.status(409).json({ error: 'A company with that domain already exists' });
      }
      console.error('Error updating company:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── DELETE /api/companies/:id ─────────────────────────────────────────────────

router.delete(
  '/:id',
  requirePermission('customers.write'),
  async (req: MultiTenantRequest, res: Response) => {
    try {
      const scope = { tenantId: req.tenantId!, workspaceId: req.workspaceId! };

      const existing = await getCompany(scope, req.params.id);
      if (!existing) return res.status(404).json({ error: 'Company not found' });

      await deleteCompany(scope, req.params.id);

      await auditRepository.log(scope, {
        actorId:    req.userId || 'system',
        action:     'COMPANY_DELETED',
        entityType: 'company',
        entityId:   req.params.id,
        oldValue:   { name: existing.name },
        metadata:   { source: 'companies_api' },
      });

      res.status(204).send();
    } catch (err) {
      console.error('Error deleting company:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

export default router;
