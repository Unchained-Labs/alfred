import { z } from "zod";

type JsonSchemaNode = Record<string, unknown>;

/**
 * Walks a generated JSON Schema and tightens it to what strict structured-output
 * modes demand: every object seals `additionalProperties` and lists all of its
 * properties as required. zod emits neither by default.
 *
 * Optional fields are expressed as nullable in our schemas precisely so this
 * transform is lossless.
 */
function tighten(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(tighten);
  if (node === null || typeof node !== "object") return node;

  const out: JsonSchemaNode = {};
  for (const [key, value] of Object.entries(node as JsonSchemaNode)) {
    out[key] = tighten(value);
  }

  if (
    out.type === "object" &&
    out.properties &&
    typeof out.properties === "object"
  ) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties as JsonSchemaNode);
  }
  return out;
}

/** zod schema -> strict JSON Schema, for providers that aren't the Anthropic SDK. */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchemaNode {
  const generated = z.toJSONSchema(schema, {
    // Inline everything: many OpenAI-compatible servers reject $defs/$ref.
    io: "output",
    target: "draft-7",
  }) as JsonSchemaNode;
  const tightened = tighten(generated) as JsonSchemaNode;
  // $schema confuses some validators; it carries no constraint information.
  delete tightened.$schema;
  return tightened;
}

const allowsNull = (node: JsonSchemaNode): boolean =>
  node.type === "null" ||
  (Array.isArray(node.type) && node.type.includes("null")) ||
  (Array.isArray(node.anyOf) &&
    (node.anyOf as JsonSchemaNode[]).some((n) => n.type === "null"));

/** The object branch of a property that may also be null, if it has one. */
const objectBranch = (node: JsonSchemaNode): JsonSchemaNode | null =>
  node.type === "object"
    ? node
    : ((node.anyOf as JsonSchemaNode[] | undefined)?.find(
        (n) => n.type === "object",
      ) ?? null);

/**
 * Fills in the fields a model left out when leaving them out can only mean
 * one thing: a property that may be null becomes null, a list becomes empty.
 *
 * Without a native schema mode a model follows the contract from the prompt,
 * and in a deeply nested reply — a scene's every step carries every field —
 * it drops the empty ones: "marker" missing from a step that has no marker.
 * That is not a disagreement about the content, and failing a five-minute
 * generation over it, permanently, is the wrong trade. Anything else missing
 * — a string, a number, an enum — still fails validation as before.
 */
export function fillOmitted(value: unknown, schema: JsonSchemaNode): unknown {
  if (Array.isArray(value)) {
    const items = schema.items as JsonSchemaNode | undefined;
    return items ? value.map((v) => fillOmitted(v, items)) : value;
  }
  if (value === null || typeof value !== "object") return value;
  const branch = objectBranch(schema);
  const properties = branch?.properties as
    Record<string, JsonSchemaNode> | undefined;
  if (!properties) return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const [key, prop] of Object.entries(properties)) {
    if (!(key in out)) {
      if (allowsNull(prop)) out[key] = null;
      else if (prop.type === "array") out[key] = [];
      continue;
    }
    const inner = prop.type === "array" ? prop : (objectBranch(prop) ?? undefined);
    if (inner) out[key] = fillOmitted(out[key], inner);
  }
  return out;
}

/**
 * Pulls the first balanced JSON object out of a model response. Needed because
 * local models commonly wrap JSON in prose or a ```json fence even when told
 * not to.
 */
export function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to scanning
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const haystack = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(haystack);
  } catch {
    // fall through to scanning
  }

  const start = haystack.indexOf("{");
  if (start === -1) throw new Error("No JSON object found in model response.");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < haystack.length; i++) {
    const char = haystack[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return JSON.parse(haystack.slice(start, i + 1));
    }
  }
  throw new Error("Model response contained an unterminated JSON object.");
}
