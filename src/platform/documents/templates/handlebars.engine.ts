import type { TemplateEngine } from '../interfaces/template-engine.interface';
import type { ModuleResolver } from '../optional-driver';
import { tryLoadDriver } from '../optional-driver';
import {
  escapeMarkup,
  isTemplateTruthy,
  resolveTemplatePath,
  stringifyValue,
} from '../markup-escape.util';

interface HandlebarsModule {
  compile(template: string): (context: unknown) => string;
}

type TextNode = { readonly kind: 'text'; readonly value: string };
type VarNode = {
  readonly kind: 'var';
  readonly path: string;
  readonly escape: boolean;
};
type EachNode = {
  readonly kind: 'each';
  readonly path: string;
  readonly children: readonly TemplateNode[];
};
type IfNode = {
  readonly kind: 'if';
  readonly path: string;
  readonly consequent: readonly TemplateNode[];
  readonly alternate: readonly TemplateNode[];
};
type TemplateNode = TextNode | VarNode | EachNode | IfNode;

interface ScanResult {
  readonly text: string;
  readonly tag: string | null;
  readonly raw: boolean;
  readonly nextIndex: number;
}

function scanNext(template: string, from: number): ScanResult {
  const openIndex = template.indexOf('{{', from);
  if (openIndex === -1) {
    return {
      text: template.slice(from),
      tag: null,
      raw: false,
      nextIndex: template.length,
    };
  }
  const text = template.slice(from, openIndex);
  const isTriple = template.startsWith('{{{', openIndex);
  const closeToken = isTriple ? '}}}' : '}}';
  const closeIndex = template.indexOf(
    closeToken,
    openIndex + (isTriple ? 3 : 2),
  );
  if (closeIndex === -1) {
    return {
      text: template.slice(from),
      tag: null,
      raw: false,
      nextIndex: template.length,
    };
  }
  const tag = template.slice(openIndex + (isTriple ? 3 : 2), closeIndex);
  return {
    text,
    tag,
    raw: isTriple,
    nextIndex: closeIndex + closeToken.length,
  };
}

interface BlockResult {
  readonly nodes: TemplateNode[];
  readonly nextIndex: number;
  readonly stopTag: string | null;
}

function parseBlock(
  template: string,
  index: number,
  stopTags: readonly string[],
): BlockResult {
  const nodes: TemplateNode[] = [];
  let cursor = index;
  for (;;) {
    const scan = scanNext(template, cursor);
    if (scan.text.length > 0) {
      nodes.push({ kind: 'text', value: scan.text });
    }
    if (scan.tag === null) {
      return { nodes, nextIndex: scan.nextIndex, stopTag: null };
    }
    const trimmed = scan.tag.trim();
    if (stopTags.includes(trimmed)) {
      return { nodes, nextIndex: scan.nextIndex, stopTag: trimmed };
    }
    if (trimmed.startsWith('#each ')) {
      const path = trimmed.slice('#each '.length).trim();
      const body = parseBlock(template, scan.nextIndex, ['/each']);
      nodes.push({ kind: 'each', path, children: body.nodes });
      cursor = body.nextIndex;
      continue;
    }
    if (trimmed.startsWith('#if ')) {
      const path = trimmed.slice('#if '.length).trim();
      const consequent = parseBlock(template, scan.nextIndex, ['else', '/if']);
      let alternate: TemplateNode[] = [];
      let nextIndex = consequent.nextIndex;
      if (consequent.stopTag === 'else') {
        const elseBranch = parseBlock(template, nextIndex, ['/if']);
        alternate = elseBranch.nodes;
        nextIndex = elseBranch.nextIndex;
      }
      nodes.push({ kind: 'if', path, consequent: consequent.nodes, alternate });
      cursor = nextIndex;
      continue;
    }
    nodes.push({ kind: 'var', path: trimmed, escape: !scan.raw });
    cursor = scan.nextIndex;
  }
}

function parseTemplate(template: string): readonly TemplateNode[] {
  return parseBlock(template, 0, []).nodes;
}

function renderNodes(nodes: readonly TemplateNode[], context: unknown): string {
  let output = '';
  for (const node of nodes) {
    switch (node.kind) {
      case 'text':
        output += node.value;
        break;
      case 'var': {
        const text = stringifyValue(resolveTemplatePath(context, node.path));
        output += node.escape ? escapeMarkup(text) : text;
        break;
      }
      case 'each': {
        const value = resolveTemplatePath(context, node.path);
        if (Array.isArray(value)) {
          for (const item of value) {
            output += renderNodes(node.children, item);
          }
        }
        break;
      }
      case 'if': {
        const value = resolveTemplatePath(context, node.path);
        output += renderNodes(
          isTemplateTruthy(value) ? node.consequent : node.alternate,
          context,
        );
        break;
      }
    }
  }
  return output;
}

/**
 * Renders `{{var}}` / `{{{raw}}}` / `{{#each}}` / `{{#if}}...{{else}}` style
 * templates. Uses the real `handlebars` package when installed (via the
 * optional driver pattern); otherwise falls back to a minimal, dependency-
 * free mustache-lite implementation covering the same common tag set.
 */
export class HandlebarsTemplateEngine implements TemplateEngine {
  public readonly name = 'handlebars';

  public constructor(private readonly resolver?: ModuleResolver) {}

  public render(
    template: string,
    context: Readonly<Record<string, unknown>> = {},
  ): string {
    const handlebars = tryLoadDriver<HandlebarsModule>(
      'handlebars',
      this.resolver,
    );
    if (handlebars) {
      return handlebars.compile(template)(context);
    }
    return renderNodes(parseTemplate(template), context);
  }
}
