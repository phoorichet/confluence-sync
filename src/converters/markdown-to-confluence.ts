import type { Node, Parent, Root } from 'mdast';
import remarkGfm from 'remark-gfm';
import remarkParse from 'remark-parse';
import { unified } from 'unified';

export class MarkdownToConfluenceConverter {
  async convert(markdown: string): Promise<string> {
    // Parse markdown to AST
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm); // Support for tables, strikethrough, etc.

    const tree = processor.parse(markdown);

    // Convert AST to Confluence storage format
    const html = this.astToConfluence(tree as Root);

    return html;
  }

  private astToConfluence(tree: Root): string {
    const htmlParts: string[] = [];

    this.visitNode(tree, htmlParts);

    return htmlParts.join('');
  }

  private visitNode(node: Node | Parent, htmlParts: string[]): void {
    switch (node.type) {
      case 'root':
        if ('children' in node) {
          node.children.forEach(child => this.visitNode(child, htmlParts));
        }
        break;

      case 'heading': {
        const level = (node as any).depth;
        htmlParts.push(`<h${level}>`);
        if ('children' in node) {
          node.children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        htmlParts.push(`</h${level}>`);
        break;
      }

      case 'paragraph':
        htmlParts.push('<p>');
        if ('children' in node) {
          (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        htmlParts.push('</p>');
        break;

      case 'text':
        htmlParts.push(this.escapeHtml((node as any).value));
        break;

      case 'strong':
        htmlParts.push('<strong>');
        if ('children' in node) {
          (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        htmlParts.push('</strong>');
        break;

      case 'emphasis':
        htmlParts.push('<em>');
        if ('children' in node) {
          (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        htmlParts.push('</em>');
        break;

      case 'delete':
        htmlParts.push('<del>');
        if ('children' in node) {
          (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        htmlParts.push('</del>');
        break;

      case 'inlineCode':
        htmlParts.push(`<code>${this.escapeHtml((node as any).value)}</code>`);
        break;

      case 'code': {
        const lang = (node as any).lang || '';

        if (lang) {
          htmlParts.push(
            `<ac:structured-macro ac:name="code">`
            + `<ac:parameter ac:name="language">${lang}</ac:parameter>`
            + `<ac:plain-text-body><![CDATA[${(node as any).value}]]></ac:plain-text-body>`
            + `</ac:structured-macro>`,
          );
        }
        else {
          htmlParts.push(
            `<ac:structured-macro ac:name="code">`
            + `<ac:plain-text-body><![CDATA[${(node as any).value}]]></ac:plain-text-body>`
            + `</ac:structured-macro>`,
          );
        }
        break;
      }

      case 'list': {
        const tag = (node as any).ordered ? 'ol' : 'ul';
        htmlParts.push(`<${tag}>`);
        if ('children' in node) {
          (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        htmlParts.push(`</${tag}>`);
        break;
      }

      case 'listItem':
        htmlParts.push('<li>');
        if ('children' in node) {
          (node as any).children.forEach((child: any, index: number) => {
            // Handle nested lists properly
            if (child.type === 'list') {
              this.visitNode(child, htmlParts);
            }
            else if (child.type === 'paragraph' && index === 0) {
              // First paragraph in list item - don't wrap in <p>
              if (child.children) {
                child.children.forEach((grandchild: any) => this.visitNode(grandchild, htmlParts));
              }
            }
            else {
              this.visitNode(child, htmlParts);
            }
          });
        }
        htmlParts.push('</li>');
        break;

      case 'link': {
        const url = (node as any).url;
        const title = (node as any).title || '';

        // Check if it's an internal link (to another Confluence page)
        if (url.startsWith('#') || url.startsWith('/wiki/')) {
          // Internal Confluence link - would need page ID in real scenario
          htmlParts.push(`<a href="${this.escapeHtml(url)}">`);
        }
        else {
          // External link
          htmlParts.push(`<a href="${this.escapeHtml(url)}"${title ? ` title="${this.escapeHtml(title)}"` : ''}>`);
        }

        if ('children' in node) {
          (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        htmlParts.push('</a>');
        break;
      }

      case 'image': {
        const src = (node as any).url;
        // const alt = (node as any).alt || '';
        // const imageTitle = (node as any).title || '';

        // In Confluence, images are typically attachments
        // For now, we'll use a simple img tag, but in production
        // this would need to handle attachment uploads
        htmlParts.push(
          `<ac:image>`
          + `<ri:attachment ri:filename="${this.getFilenameFromUrl(src)}" />`
          + `</ac:image>`,
        );
        break;
      }

      case 'blockquote':
        htmlParts.push('<blockquote>');
        if ('children' in node) {
          (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        htmlParts.push('</blockquote>');
        break;

      case 'thematicBreak':
        htmlParts.push('<hr/>');
        break;

      case 'table':
        htmlParts.push('<table><tbody>');
        if ('children' in node) {
          (node as any).children.forEach((child: any, index: number) => {
            this.visitTableRow(child, htmlParts, index === 0);
          });
        }
        htmlParts.push('</tbody></table>');
        break;

      case 'tableRow':
        // Handled by visitTableRow
        break;

      case 'tableCell':
        // Handled by visitTableRow
        break;

      case 'html':
        // Pass through HTML as-is (though Confluence may not support all HTML)
        htmlParts.push((node as any).value);
        break;

      default:
        // For unknown node types, try to process children if they exist
        if ('children' in node) {
          (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
        }
        break;
    }
  }

  private visitTableRow(row: any, htmlParts: string[], isHeader: boolean): void {
    htmlParts.push('<tr>');

    if (row.children) {
      row.children.forEach((cell: any) => {
        const tag = isHeader ? 'th' : 'td';
        htmlParts.push(`<${tag}>`);

        if (cell.children) {
          cell.children.forEach((child: any) => this.visitNode(child, htmlParts));
        }

        htmlParts.push(`</${tag}>`);
      });
    }

    htmlParts.push('</tr>');
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private getFilenameFromUrl(url: string): string {
    // Extract filename from URL or path
    const parts = url.split('/');
    return parts[parts.length - 1] || 'image';
  }
}
