import type { RegexNode } from './ast.ts';
import type { CharSet } from './charset.ts';
import { parseRegex, type RegexDiagnostic } from './parser.ts';

function formatCode(code: number): string {
  const printable = code > 0x20 && code < 0x7f;
  return printable ? String.fromCharCode(code) : `\\x${code.toString(16).padStart(2, '0')}`;
}

/** Compact notation for sets in test expectations: `'a'` for one character, else `[a-z_]`. */
export function formatSet(set: CharSet): string {
  const ranges = set.ranges();
  const [only] = ranges;
  if (ranges.length === 1 && only && only[0] === only[1]) return `'${formatCode(only[0])}'`;
  const body = ranges.map(([first, last]) =>
    first === last ? formatCode(first) : `${formatCode(first)}-${formatCode(last)}`,
  );
  return `[${body.join('')}]`;
}

/** Compact S-expression notation for syntax trees in test expectations, without source ranges. */
export function formatAst(node: RegexNode): string {
  switch (node.type) {
    case 'empty':
      return 'ε';
    case 'chars':
      return formatSet(node.set);
    case 'concat':
      return `(cat ${node.parts.map(formatAst).join(' ')})`;
    case 'alternation':
      return `(alt ${node.options.map(formatAst).join(' ')})`;
    case 'repeat':
      return `(rep ${formatAst(node.body)} ${node.min} ${node.max ?? 'inf'})`;
  }
}

/** Parses a regex that is expected to be valid and returns its syntax tree. */
export function parseValid(source: string): RegexNode {
  const result = parseRegex(source);
  if (!result.ok) throw new Error(`Expected ${JSON.stringify(source)} to parse: ${result.error.message}`);
  return result.ast;
}

/** Parses a regex that is expected to be invalid and returns its diagnostic. */
export function parseInvalid(source: string): RegexDiagnostic {
  const result = parseRegex(source);
  if (result.ok) throw new Error(`Expected ${JSON.stringify(source)} to be rejected`);
  return result.error;
}

/** The tree notation of a valid regex. */
export function tree(source: string): string {
  return formatAst(parseValid(source));
}
