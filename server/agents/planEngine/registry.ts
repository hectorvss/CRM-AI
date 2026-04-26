/**
 * server/agents/planEngine/registry.ts
 *
 * Central registry of ToolSpecs. Enforces:
 *  - Unique tool names
 *  - Version tracking (for audit and migration)
 *  - Deprecation filtering (deprecated tools hidden from LLM catalog)
 *  - Permission-aware listing (tools the caller lacks rights to use are hidden)
 *
 * The registry itself is purely in-process; there is no DB persistence here.
 */

import type { ToolSpec, SchemaDescriptor } from './types.js';
import { logger } from '../../utils/logger.js';
import { isToolBlocked } from './safety.js';

class ToolRegistry {
  private tools = new Map<string, ToolSpec<any, any>>();

  /**
   * Register a tool. Throws synchronously on duplicate name to catch
   * programming errors at startup.
   */
  register<TArgs, TReturns>(spec: ToolSpec<TArgs, TReturns>): void {
    if (this.tools.has(spec.name)) {
      throw new Error(`PlanEngine: tool "${spec.name}" is already registered`);
    }
    this.tools.set(spec.name, spec as ToolSpec<any, any>);
    logger.debug('PlanEngine tool registered', {
      tool: spec.name,
      version: spec.version,
      sideEffect: spec.sideEffect,
      risk: spec.risk,
    });
  }

  /** Retrieve a tool by name. Returns undefined if unknown. */
  get(name: string): ToolSpec<any, any> | undefined {
    return this.tools.get(name);
  }

  /** Count of registered (non-deprecated) tools. */
  size(): number {
    let n = 0;
    for (const t of this.tools.values()) if (!t.deprecated && !isToolBlocked(t.name)) n++;
    return n;
  }

  /**
   * Tools visible to the LLM for a given caller. Excludes:
   *  - Deprecated tools
   *  - Tools whose required permission the caller lacks
   *
   * This is the ONLY function the context builder should use when describing
   * the available toolset to the model. Never pass the full registry.
   */
  listForCaller(hasPermission: (perm: string) => boolean): CatalogEntry[] {
    const out: CatalogEntry[] = [];
    for (const spec of this.tools.values()) {
      if (spec.deprecated) continue;
      if (isToolBlocked(spec.name)) continue;
      if (spec.requiredPermission && !hasPermission(spec.requiredPermission)) continue;
      out.push({
        name: spec.name,
        version: spec.version,
        description: spec.description,
        category: spec.category,
        sideEffect: spec.sideEffect,
        risk: spec.risk,
        args: spec.args.describe(),
        returns: spec.returns.describe(),
      });
    }
    return out;
  }

  /**
   * Admin-level listing — includes deprecated tools and surfaces permission
   * requirements. Used for observability dashboards, not the LLM prompt.
   */
  listAll(): Array<CatalogEntry & { deprecated: boolean; requiredPermission?: string }> {
    return Array.from(this.tools.values()).map((spec) => ({
      name: spec.name,
      version: spec.version,
      description: spec.description,
      category: spec.category,
      sideEffect: spec.sideEffect,
      risk: spec.risk,
      args: spec.args.describe(),
      returns: spec.returns.describe(),
      deprecated: spec.deprecated === true,
      blocked: isToolBlocked(spec.name),
      requiredPermission: spec.requiredPermission,
    }));
  }

  /** Test-only. Clears all registered tools. */
  _resetForTests(): void {
    this.tools.clear();
  }
}

export interface CatalogEntry {
  name: string;
  version: string;
  description: string;
  category: ToolSpec['category'];
  sideEffect: ToolSpec['sideEffect'];
  risk: ToolSpec['risk'];
  args: SchemaDescriptor;
  returns: SchemaDescriptor;
  blocked?: boolean;
}

/**
 * Process-wide singleton. Tools are registered at module load time from
 * `server/agents/planEngine/tools/index.ts` (see that file for the manifest).
 */
export const toolRegistry = new ToolRegistry();
