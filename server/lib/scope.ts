export interface Scope {
  tenantId: string;
  workspaceId: string;
}

export function requireScope(
  ctx: { tenantId?: string | null; workspaceId?: string | null },
  location: string,
): Scope {
  if (!ctx.tenantId || !ctx.workspaceId) {
    throw new Error(`[${location}] Missing tenant/workspace scope. tenantId="${ctx.tenantId}" workspaceId="${ctx.workspaceId}"`);
  }

  return { tenantId: ctx.tenantId, workspaceId: ctx.workspaceId };
}
