/**
 * server/agents/chatAgent/toolAdapter.ts
 *
 * Converts Plan Engine CatalogEntries into provider tool definitions.
 *
 * Anthropic/OpenAI tool names must match ^[a-zA-Z0-9_-]{1,128}$ while our
 * registry uses dotted names ("payment.refund", "linear.issue.create") — the
 * adapter keeps a bidirectional name map, the same trick PostHog avoids by
 * enforcing snake_case MaxTool names against the AssistantTool enum.
 *
 * The description is suffixed with side-effect + risk so the model can reason
 * about which calls are safe to chain (PostHog encodes this guidance in each
 * MaxTool description too).
 */

import type { CatalogEntry } from '../planEngine/registry.js';
import type { SchemaDescriptor } from '../planEngine/types.js';
import type { ProviderTool } from './providers/types.js';

export interface AdaptedToolkit {
  tools: ProviderTool[];
  /** API-safe name → canonical registry name. */
  resolveToolName: (apiName: string) => string;
  /** Canonical registry name → API-safe name. */
  toApiName: (canonicalName: string) => string;
}

export function sanitizeToolName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '__').slice(0, 128);
}

/** SchemaDescriptor (planEngine/types.ts) → JSON Schema (input_schema). */
export function schemaDescriptorToJsonSchema(d: SchemaDescriptor): Record<string, unknown> {
  switch (d.type) {
    case 'string': {
      const schema: Record<string, unknown> = { type: 'string' };
      if (d.description) schema.description = d.description;
      if (d.enum?.length) schema.enum = d.enum;
      if (typeof d.min === 'number') schema.minLength = d.min;
      if (typeof d.max === 'number') schema.maxLength = d.max;
      return schema;
    }
    case 'number': {
      const schema: Record<string, unknown> = { type: d.integer ? 'integer' : 'number' };
      if (d.description) schema.description = d.description;
      if (typeof d.min === 'number') schema.minimum = d.min;
      if (typeof d.max === 'number') schema.maximum = d.max;
      return schema;
    }
    case 'boolean': {
      const schema: Record<string, unknown> = { type: 'boolean' };
      if (d.description) schema.description = d.description;
      return schema;
    }
    case 'object': {
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [key, field] of Object.entries(d.fields ?? {})) {
        properties[key] = schemaDescriptorToJsonSchema(field);
        if (field.required) required.push(key);
      }
      const schema: Record<string, unknown> = { type: 'object', properties };
      if (required.length) schema.required = required;
      if (d.description) schema.description = d.description;
      return schema;
    }
    case 'array': {
      const schema: Record<string, unknown> = {
        type: 'array',
        items: schemaDescriptorToJsonSchema(d.items),
      };
      if (d.description) schema.description = d.description;
      return schema;
    }
    case 'any':
    default: {
      // Providers require a concrete type; accept any JSON via permissive object.
      const schema: Record<string, unknown> = { type: 'object', additionalProperties: true };
      schema.description = d.description
        ? `${d.description} (any JSON value, wrap scalars as {"value": ...})`
        : 'Any JSON value, wrap scalars as {"value": ...}';
      return schema;
    }
  }
}

/** Root-level args must be an object schema for both providers. */
function toInputSchema(args: SchemaDescriptor): Record<string, unknown> {
  const schema = schemaDescriptorToJsonSchema(args);
  if (schema.type !== 'object') {
    return {
      type: 'object',
      properties: { value: schema },
      required: args.required ? ['value'] : [],
    };
  }
  return schema;
}

export function adaptToolkit(catalog: CatalogEntry[]): AdaptedToolkit {
  const apiToCanonical = new Map<string, string>();
  const canonicalToApi = new Map<string, string>();
  const tools: ProviderTool[] = [];

  for (const entry of catalog) {
    let apiName = sanitizeToolName(entry.name);
    // Guard collisions ("a.b" and "a_b" both sanitize distinct, but be safe).
    if (apiToCanonical.has(apiName) && apiToCanonical.get(apiName) !== entry.name) {
      apiName = sanitizeToolName(`${entry.name}_${apiToCanonical.size}`);
    }
    apiToCanonical.set(apiName, entry.name);
    canonicalToApi.set(entry.name, apiName);

    tools.push({
      name: apiName,
      description: `${entry.description} [side-effect: ${entry.sideEffect}, risk: ${entry.risk}]`,
      inputSchema: toInputSchema(entry.args),
    });
  }

  return {
    tools,
    resolveToolName: (apiName) => apiToCanonical.get(apiName) ?? apiName,
    toApiName: (canonicalName) => canonicalToApi.get(canonicalName) ?? sanitizeToolName(canonicalName),
  };
}
