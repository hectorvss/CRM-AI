/**
 * server/agents/planEngine/schema.ts
 *
 * Minimal, dep-free schema builder used by ToolSpecs. Designed to be swapped
 * for zod later without changing the Schema<T> interface.
 *
 * Usage:
 *   const Args = s.object({
 *     caseId: s.string({ description: 'Case UUID' }),
 *     status: s.enum(['open', 'pending', 'resolved']),
 *     reason: s.string({ required: false, max: 500 }),
 *   });
 *   Args.parse(input); // { ok: true, value: typed } | { ok: false, error }
 */

import type { Schema, SchemaDescriptor, SchemaResult } from './types.js';

// ── Internal helpers ─────────────────────────────────────────────────────────

function fail(error: string, path?: string): SchemaResult<never> {
  return { ok: false, error, path };
}

function ok<T>(value: T): SchemaResult<T> {
  return { ok: true, value };
}

// ── Primitive builders ───────────────────────────────────────────────────────

interface StringOpts {
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
  enumValues?: string[];
}

export function stringSchema(opts: StringOpts = {}): Schema<string> {
  const required = opts.required ?? true;
  return {
    parse(input) {
      if (input === undefined || input === null || input === '') {
        if (required) return fail('value is required');
        // Optional string fields used to coerce empty/missing input to ''.
        // The LLM frequently emits "" for optional UUID-shaped args
        // (domainId, customerId, etc.); passing that through to a Postgres
        // FK lookup throws 23503 ("Key (domain_id)=() is not present").
        // Returning undefined makes downstream `args.foo ?? null` patterns
        // do the right thing automatically.
        return ok(undefined as unknown as string);
      }
      // Trim and re-check: "   " from the LLM should also collapse to undefined.
      if (typeof input === 'string' && input.trim() === '' && !required) {
        return ok(undefined as unknown as string);
      }
      if (typeof input !== 'string') return fail(`expected string, got ${typeof input}`);
      if (opts.min !== undefined && input.length < opts.min) return fail(`string shorter than min=${opts.min}`);
      if (opts.max !== undefined && input.length > opts.max) return fail(`string longer than max=${opts.max}`);
      if (opts.enumValues && !opts.enumValues.includes(input)) {
        return fail(`value "${input}" not in enum [${opts.enumValues.join(', ')}]`);
      }
      return ok(input);
    },
    describe(): SchemaDescriptor {
      return {
        type: 'string',
        required,
        description: opts.description,
        min: opts.min,
        max: opts.max,
        enum: opts.enumValues,
      };
    },
  };
}

interface NumberOpts {
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
  integer?: boolean;
}

export function numberSchema(opts: NumberOpts = {}): Schema<number> {
  const required = opts.required ?? true;
  return {
    parse(input) {
      if (input === undefined || input === null || input === '') {
        if (required) return fail('value is required');
        return ok(0);
      }
      const coerced = typeof input === 'string' ? Number(input) : input;
      if (typeof coerced !== 'number' || Number.isNaN(coerced)) return fail('expected number');
      if (opts.integer && !Number.isInteger(coerced)) return fail('expected integer');
      if (opts.min !== undefined && coerced < opts.min) return fail(`number smaller than min=${opts.min}`);
      if (opts.max !== undefined && coerced > opts.max) return fail(`number greater than max=${opts.max}`);
      return ok(coerced);
    },
    describe(): SchemaDescriptor {
      return {
        type: 'number',
        required,
        description: opts.description,
        min: opts.min,
        max: opts.max,
        integer: opts.integer,
      };
    },
  };
}

interface BooleanOpts {
  required?: boolean;
  description?: string;
}

export function booleanSchema(opts: BooleanOpts = {}): Schema<boolean> {
  const required = opts.required ?? true;
  return {
    parse(input) {
      if (input === undefined || input === null) {
        if (required) return fail('value is required');
        return ok(false);
      }
      if (typeof input === 'boolean') return ok(input);
      if (input === 'true') return ok(true);
      if (input === 'false') return ok(false);
      return fail('expected boolean');
    },
    describe(): SchemaDescriptor {
      return { type: 'boolean', required, description: opts.description };
    },
  };
}

// ── Object and array builders ────────────────────────────────────────────────

interface ObjectOpts {
  required?: boolean;
  description?: string;
}

export function objectSchema<S extends Record<string, Schema<any>>>(
  fields: S,
  opts: ObjectOpts = {},
): Schema<{ [K in keyof S]: S[K] extends Schema<infer U> ? U : never }> {
  const required = opts.required ?? true;
  return {
    parse(input) {
      if (input === undefined || input === null) {
        if (required) return fail('object is required');
        return ok({} as any);
      }
      if (typeof input !== 'object' || Array.isArray(input)) return fail('expected object');

      const out: Record<string, unknown> = {};
      for (const key of Object.keys(fields)) {
        const raw = (input as Record<string, unknown>)[key];
        const res = fields[key].parse(raw);
        if (!res.ok) return fail(`${key}: ${(res as { ok: false; error: string }).error}`, key);
        out[key] = res.value;
      }
      return ok(out as any);
    },
    describe(): SchemaDescriptor {
      const desc: SchemaDescriptor = {
        type: 'object',
        required,
        description: opts.description,
        fields: {},
      };
      for (const key of Object.keys(fields)) {
        desc.fields[key] = fields[key].describe();
      }
      return desc;
    },
  };
}

interface ArrayOpts {
  required?: boolean;
  description?: string;
  min?: number;
  max?: number;
}

export function arraySchema<T>(items: Schema<T>, opts: ArrayOpts = {}): Schema<T[]> {
  const required = opts.required ?? true;
  return {
    parse(input) {
      if (input === undefined || input === null) {
        if (required) return fail('array is required');
        return ok([]);
      }
      if (!Array.isArray(input)) return fail('expected array');
      if (opts.min !== undefined && input.length < opts.min) return fail(`array shorter than min=${opts.min}`);
      if (opts.max !== undefined && input.length > opts.max) return fail(`array longer than max=${opts.max}`);

      const out: T[] = [];
      for (let i = 0; i < input.length; i++) {
        const res = items.parse(input[i]);
        if (!res.ok) return fail(`[${i}]: ${(res as { ok: false; error: string }).error}`, `[${i}]`);
        out.push(res.value);
      }
      return ok(out);
    },
    describe(): SchemaDescriptor {
      return {
        type: 'array',
        required,
        description: opts.description,
        items: items.describe(),
      };
    },
  };
}

// ── Any / escape hatch ───────────────────────────────────────────────────────

export function anySchema(description?: string): Schema<unknown> {
  return {
    parse(input) {
      return ok(input);
    },
    describe(): SchemaDescriptor {
      return { type: 'any', required: false, description };
    },
  };
}

// ── Enum sugar ──────────────────────────────────────────────────────────────

export function enumSchema<T extends string>(values: readonly T[], opts: Omit<StringOpts, 'enumValues'> = {}): Schema<T> {
  return stringSchema({ ...opts, enumValues: values as unknown as string[] }) as unknown as Schema<T>;
}

// ── Convenience namespace ───────────────────────────────────────────────────

export const s = {
  string: stringSchema,
  number: numberSchema,
  boolean: booleanSchema,
  object: objectSchema,
  array: arraySchema,
  any: anySchema,
  enum: enumSchema,
};
