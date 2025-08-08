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
        if (url.startsWith('#')) {
          // Anchor link within the same page
          htmlParts.push(
            `<ac:link ac:anchor="${this.escapeHtml(url.substring(1))}">`
            + `<ac:plain-text-link-body><![CDATA[`,
          );
          if ('children' in node) {
            (node as any).children.forEach((child: any) => {
              if (child.type === 'text') {
                htmlParts.push(child.value);
              }
            });
          }
          htmlParts.push(`]]></ac:plain-text-link-body></ac:link>`);
        }
        else if (url.startsWith('/wiki/') || url.match(/^[^:]+\.md$/)) {
          // Internal Confluence link - treating .md files as internal pages
          const pageName = url.replace(/^\/wiki\//, '').replace(/\.md$/, '');
          htmlParts.push(
            `<ac:link>`
            + `<ri:page ri:content-title="${this.escapeHtml(pageName)}" />`
            + `<ac:plain-text-link-body><![CDATA[`,
          );
          if ('children' in node) {
            (node as any).children.forEach((child: any) => {
              if (child.type === 'text') {
                htmlParts.push(child.value);
              }
            });
          }
          htmlParts.push(`]]></ac:plain-text-link-body></ac:link>`);
        }
        else {
          // External link
          htmlParts.push(`<a href="${this.escapeHtml(url)}"${title ? ` title="${this.escapeHtml(title)}"` : ''}>`);
          if ('children' in node) {
            (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
          }
          htmlParts.push('</a>');
        }
        break;
      }

      case 'image': {
        const src = (node as any).url;
        const alt = (node as any).alt || '';
        const imageTitle = (node as any).title || '';

        // Handle different image source types
        if (src.startsWith('http://') || src.startsWith('https://')) {
          // External image - use URL directly
          htmlParts.push(
            `<ac:image>`
            + `<ri:url ri:value="${this.escapeHtml(src)}" />${
              alt ? `<ac:caption>${this.escapeHtml(alt)}</ac:caption>` : ''
            }</ac:image>`,
          );
        }
        else {
          // Local image - treat as attachment (preserve relative path)
          const filename = this.getFilenameFromUrl(src);
          htmlParts.push(
            `<ac:image${imageTitle ? ` ac:title="${this.escapeHtml(imageTitle)}"` : ''}>`
            + `<ri:attachment ri:filename="${this.escapeHtml(filename)}" />${
              alt ? `<ac:caption>${this.escapeHtml(alt)}</ac:caption>` : ''
            }</ac:image>`,
          );
        }
        break;
      }

      case 'blockquote': {
        // Check if this is a special panel-type blockquote
        const firstChild = (node as any).children?.[0];
        let isPanelBlockquote = false;
        let panelType = 'note';

        if (firstChild?.type === 'paragraph' && firstChild.children?.[0]?.type === 'text') {
          const text = firstChild.children[0].value;
          const panelMatch = text.match(/^\[!(INFO|WARNING|NOTE|TIP)\]/);
          if (panelMatch) {
            isPanelBlockquote = true;
            panelType = panelMatch[1].toLowerCase();
            // Remove the marker from the text
            firstChild.children[0].value = text.replace(/^\[!(INFO|WARNING|NOTE|TIP)\]\s*/, '');
          }
        }

        if (isPanelBlockquote) {
          htmlParts.push(
            `<ac:structured-macro ac:name="${panelType}">`
            + `<ac:rich-text-body>`,
          );
          if ('children' in node) {
            (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
          }
          htmlParts.push(
            `</ac:rich-text-body>`
            + `</ac:structured-macro>`,
          );
        }
        else {
          htmlParts.push('<blockquote>');
          if ('children' in node) {
            (node as any).children.forEach((child: any) => this.visitNode(child, htmlParts));
          }
          htmlParts.push('</blockquote>');
        }
        break;
      }

      case 'thematicBreak':
        htmlParts.push('<hr/>');
        break;

      case 'table': {
        // Check if table has headers (first row is header if followed by separator)
        const hasHeader = (node as any).children?.length > 1;

        if (hasHeader) {
          htmlParts.push('<table><thead>');
          // First row is header
          this.visitTableRow((node as any).children[0], htmlParts, true);
          htmlParts.push('</thead><tbody>');
          // Rest are body rows (skip separator row at index 1 if exists)
          for (let i = 1; i < (node as any).children.length; i++) {
            // Skip separator rows in markdown (they don't translate to HTML)
            if (!this.isTableSeparatorRow((node as any).children[i])) {
              this.visitTableRow((node as any).children[i], htmlParts, false);
            }
          }
          htmlParts.push('</tbody></table>');
        }
        else {
          htmlParts.push('<table><tbody>');
          if ('children' in node) {
            (node as any).children.forEach((child: any) => {
              if (!this.isTableSeparatorRow(child)) {
                this.visitTableRow(child, htmlParts, false);
              }
            });
          }
          htmlParts.push('</tbody></table>');
        }
        break;
      }

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

  /**
   * Check if a table row is just a separator (markdown table formatting)
   */
  private isTableSeparatorRow(row: any): boolean {
    if (!row || row.type !== 'tableRow' || !row.children) {
      return false;
    }

    // Check if all cells contain only dashes and colons (separator syntax)
    return row.children.every((cell: any) => {
      if (!cell.children || cell.children.length === 0)
        return true;

      const content = cell.children
        .filter((child: any) => child.type === 'text')
        .map((child: any) => child.value)
        .join('');

      return /^:?-+:?$/.test(content.trim());
    });
  }
}
