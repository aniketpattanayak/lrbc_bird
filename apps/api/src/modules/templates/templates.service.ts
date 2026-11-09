/**
 * Message template management.
 *
 * There's no dedicated Template table in this schema yet, so templates are
 * persisted as a structured list inside Tenant.metadata — real, durable,
 * per-tenant data, just stored in the generic JSON bucket rather than a new
 * relational table (adding one would need a migration run against a live
 * database, which isn't available in every environment this runs in).
 *
 * Approval:
 *  - OFFICIAL (Meta Cloud API) tenants: submitted for REAL review via
 *    POST /{wabaId}/message_templates, and status is read back from Meta's
 *    real review result (which can take minutes to ~48 hours) — never faked.
 *  - UNOFFICIAL (Baileys/QR) tenants: there is no WABA to submit a template
 *    to — Meta's template system only exists for the Cloud API — so this
 *    stays a local simulation (clearly a simulation): a submitted template
 *    sits PENDING for ~20s and then resolves to APPROVED (90%) or
 *    REJECTED (10%) with a canned reason, purely so the UI flow is testable
 *    without a Meta account.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@wsaas/database';
import { NotFoundError, ValidationError, ConflictError } from '@wsaas/utils';
import { createLogger } from '@wsaas/logger';
import { submitTemplateToMeta, getTemplateStatus, MetaApiError, type SubmitTemplateInput } from '@wsaas/meta-cloud-api';
import type { CreateTemplateDto, UpdateTemplateDto } from './templates.schema';

type TemplateButton = CreateTemplateDto['buttons'][number];

const logger = createLogger({ name: 'api:templates' });

const PENDING_RESOLVE_AFTER_MS = 20_000;
const REJECTION_REASONS = [
  'Body text contains promotional language not allowed for the UTILITY category.',
  'Template is too similar to an existing approved template.',
  'Header media does not match the stated template category.',
];

export interface MessageTemplate {
  id: string;
  name: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  language: string;
  headerType: 'NONE' | 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  headerContent: string | null;
  body: string;
  footer: string | null;
  buttons: TemplateButton[];
  status: 'DRAFT' | 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Set only for templates actually submitted to Meta (Official tenants). */
  metaTemplateId: string | null;
}

async function readTemplates(tenantId: string): Promise<MessageTemplate[]> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
  if (!tenant) throw new NotFoundError('Tenant', tenantId);
  const metadata = (tenant.metadata as Record<string, unknown> | null) ?? {};
  return (metadata['messageTemplates'] as MessageTemplate[] | undefined) ?? [];
}

async function writeTemplates(tenantId: string, templates: MessageTemplate[]): Promise<void> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { metadata: true } });
  const metadata = { ...((tenant?.metadata as Record<string, unknown> | null) ?? {}) };
  metadata['messageTemplates'] = templates;
  await prisma.tenant.update({ where: { id: tenantId }, data: { metadata: metadata as any } });
}

interface MetaCredentials {
  wabaId: string;
  accessToken: string;
}

/** Finds the tenant's Official instance's stored Meta credentials, if any. */
async function getOfficialCredentials(tenantId: string): Promise<MetaCredentials | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { whatsappMode: true } });
  if (tenant?.whatsappMode !== 'OFFICIAL') return null;

  const instance = await prisma.instance.findFirst({
    where: { tenantId, deletedAt: null },
    select: { metadata: true },
  });
  const meta = (instance?.metadata as { meta?: { wabaId?: string; accessToken?: string } } | null)?.meta;
  if (!meta?.wabaId || !meta?.accessToken) return null;
  return { wabaId: meta.wabaId, accessToken: meta.accessToken };
}

function toMetaComponents(t: Pick<MessageTemplate, 'headerType' | 'headerContent' | 'body' | 'footer' | 'buttons'>): SubmitTemplateInput['components'] {
  const components: SubmitTemplateInput['components'] = [];

  if (t.headerType !== 'NONE') {
    components.push({
      type: 'HEADER',
      format: t.headerType,
      ...(t.headerType === 'TEXT' ? { text: t.headerContent ?? '' } : {}),
    });
  }

  components.push({ type: 'BODY', text: t.body });

  if (t.footer) {
    components.push({ type: 'FOOTER', text: t.footer });
  }

  if (t.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: t.buttons.map((b) => ({
        type: b.type,
        text: b.text,
        ...(b.type === 'URL' ? { url: b.value } : {}),
        ...(b.type === 'PHONE_NUMBER' ? { phone_number: b.value } : {}),
      })),
    });
  }

  return components;
}

/** Simulated resolution for UNOFFICIAL tenants' PENDING templates (no real WABA to submit to). */
function resolveSimulatedPending(templates: MessageTemplate[]): { templates: MessageTemplate[]; changed: boolean } {
  let changed = false;
  const now = Date.now();

  const resolved = templates.map((t) => {
    if (t.status !== 'PENDING' || !t.submittedAt || t.metaTemplateId) return t;
    if (now - new Date(t.submittedAt).getTime() < PENDING_RESOLVE_AFTER_MS) return t;

    changed = true;
    const approved = Math.random() < 0.9;
    return {
      ...t,
      status: approved ? 'APPROVED' : 'REJECTED',
      rejectionReason: approved ? null : REJECTION_REASONS[Math.floor(Math.random() * REJECTION_REASONS.length)] ?? null,
      updatedAt: new Date().toISOString(),
    } as MessageTemplate;
  });

  return { templates: resolved, changed };
}

/** Real resolution for Official tenants: asks Meta for each PENDING template's actual review status. */
async function resolveMetaPending(
  tenantId: string,
  templates: MessageTemplate[],
): Promise<{ templates: MessageTemplate[]; changed: boolean }> {
  const pending = templates.filter((t) => t.status === 'PENDING' && t.metaTemplateId);
  if (pending.length === 0) return { templates, changed: false };

  const creds = await getOfficialCredentials(tenantId);
  if (!creds) return { templates, changed: false };

  let changed = false;
  const byId = new Map(templates.map((t) => [t.id, t]));

  for (const t of pending) {
    try {
      const metaStatus = await getTemplateStatus(creds.wabaId, creds.accessToken, t.name);
      if (!metaStatus || metaStatus.status === 'PENDING') continue;

      const approved = metaStatus.status === 'APPROVED';
      byId.set(t.id, {
        ...t,
        status: approved ? 'APPROVED' : metaStatus.status === 'REJECTED' ? 'REJECTED' : t.status,
        rejectionReason: metaStatus.rejected_reason ?? null,
        updatedAt: new Date().toISOString(),
      });
      changed = true;
    } catch (err) {
      logger.warn({ err, tenantId, templateId: t.id }, 'Failed to refresh real Meta template status');
    }
  }

  return { templates: Array.from(byId.values()), changed };
}

export async function listTemplates(tenantId: string): Promise<MessageTemplate[]> {
  let templates = await readTemplates(tenantId);

  const { templates: simResolved, changed: simChanged } = resolveSimulatedPending(templates);
  templates = simResolved;

  const { templates: metaResolved, changed: metaChanged } = await resolveMetaPending(tenantId, templates);
  templates = metaResolved;

  if (simChanged || metaChanged) await writeTemplates(tenantId, templates);
  return templates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createTemplate(tenantId: string, dto: CreateTemplateDto): Promise<MessageTemplate> {
  const templates = await readTemplates(tenantId);

  if (templates.some((t) => t.name === dto.name && t.language === dto.language)) {
    throw new ConflictError(`A template named '${dto.name}' already exists for language '${dto.language}'`);
  }

  const now = new Date().toISOString();
  const template: MessageTemplate = {
    id: randomUUID(),
    name: dto.name,
    category: dto.category,
    language: dto.language,
    headerType: dto.headerType,
    headerContent: dto.headerContent ?? null,
    body: dto.body,
    footer: dto.footer ?? null,
    buttons: dto.buttons,
    status: 'DRAFT',
    rejectionReason: null,
    submittedAt: null,
    createdAt: now,
    updatedAt: now,
    metaTemplateId: null,
  };

  await writeTemplates(tenantId, [...templates, template]);
  logger.info({ tenantId, templateId: template.id, name: template.name }, 'Template created');
  return template;
}

export async function updateTemplate(tenantId: string, templateId: string, dto: UpdateTemplateDto): Promise<MessageTemplate> {
  const templates = await readTemplates(tenantId);
  const existing = templates.find((t) => t.id === templateId);
  if (!existing) throw new NotFoundError('Template', templateId);

  if (existing.status !== 'DRAFT' && existing.status !== 'REJECTED') {
    throw new ValidationError('Only draft or rejected templates can be edited');
  }

  const updated: MessageTemplate = {
    ...existing,
    ...(dto.name !== undefined && { name: dto.name }),
    ...(dto.category !== undefined && { category: dto.category }),
    ...(dto.language !== undefined && { language: dto.language }),
    ...(dto.headerType !== undefined && { headerType: dto.headerType }),
    ...(dto.headerContent !== undefined && { headerContent: dto.headerContent }),
    ...(dto.body !== undefined && { body: dto.body }),
    ...(dto.footer !== undefined && { footer: dto.footer }),
    ...(dto.buttons !== undefined && { buttons: dto.buttons }),
    status: 'DRAFT',
    rejectionReason: null,
    updatedAt: new Date().toISOString(),
  };

  const next = templates.map((t) => (t.id === templateId ? updated : t));
  await writeTemplates(tenantId, next);
  logger.info({ tenantId, templateId }, 'Template updated');
  return updated;
}

export async function deleteTemplate(tenantId: string, templateId: string): Promise<void> {
  const templates = await readTemplates(tenantId);
  if (!templates.some((t) => t.id === templateId)) {
    throw new NotFoundError('Template', templateId);
  }
  await writeTemplates(tenantId, templates.filter((t) => t.id !== templateId));
  logger.info({ tenantId, templateId }, 'Template deleted');
}

export async function submitTemplate(tenantId: string, templateId: string): Promise<MessageTemplate> {
  const templates = await readTemplates(tenantId);
  const existing = templates.find((t) => t.id === templateId);
  if (!existing) throw new NotFoundError('Template', templateId);

  if (existing.status === 'PENDING' || existing.status === 'APPROVED') {
    throw new ValidationError(`Template is already ${existing.status.toLowerCase()}`);
  }

  const creds = await getOfficialCredentials(tenantId);
  let metaTemplateId: string | null = null;

  if (creds) {
    // Official tenant with real Meta credentials — submit for real review.
    try {
      const result = await submitTemplateToMeta(creds.wabaId, creds.accessToken, {
        name: existing.name,
        category: existing.category,
        language: existing.language,
        components: toMetaComponents(existing),
      });
      metaTemplateId = result.id;
    } catch (err) {
      if (err instanceof MetaApiError) {
        throw new ValidationError(`Meta rejected this template submission: ${err.message}`);
      }
      throw err;
    }
  }
  // else: UNOFFICIAL tenant — no WABA to submit to, falls through to the
  // local simulated review in resolveSimulatedPending().

  const updated: MessageTemplate = {
    ...existing,
    status: 'PENDING',
    rejectionReason: null,
    submittedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metaTemplateId,
  };

  const next = templates.map((t) => (t.id === templateId ? updated : t));
  await writeTemplates(tenantId, next);
  logger.info({ tenantId, templateId, real: Boolean(metaTemplateId) }, 'Template submitted for approval');
  return updated;
}
