import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkGfm from 'remark-gfm';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import * as yaml from 'yaml';
import { logger } from '../utils/logger.js';

interface PageMetadata {
  pageId: string;
  spaceKey: string;
  title: string;
  status?: string;
  version: number;
  lastModified: string;
  author?: string;
  parentId?: string;
  parentType?: string;
  url?: string;
}

export class ConfluenceToMarkdownConverter {
  private processor;
  private panels: { id: string; type: string; content: string }[] = [];

  constructor() {
    // Set up unified processor for HTML to Markdown conversion
    this.processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeRemark)
      .use(remarkGfm) // Add GFM support for tables
      .use(remarkStringify, {
        bullet: '-',
        fence: '`',
        fences: true,
        incrementListMarker: true,
      });
  }

  /**
   * Convert Confluence storage format (XHTML) to Markdown
   */
  async convert(confluenceContent: string, metadata?: PageMetadata): Promise<string> {
    try {
      if (!confluenceContent || confluenceContent.trim().length === 0) {
        return metadata ? this.addFrontmatter('', metadata) : '';
      }

      // Reset panels for each conversion
      this.panels = [];

      // Pre-process Confluence-specific elements
      const preprocessed = this.preprocessConfluenceElements(confluenceContent);

      // Convert to Markdown using unified
      const result = await this.processor.process(preprocessed);
      const markdown = String(result);

      // Post-process to clean up any artifacts
      let cleaned = this.postprocessMarkdown(markdown);

      // Add frontmatter if metadata is provided
      if (metadata) {
        cleaned = this.addFrontmatter(cleaned, metadata);
      }

      return cleaned;
    }
    catch (error) {
      logger.error('Failed to convert Confluence content to Markdown', error);
      throw new Error(`CS-500: Failed to convert content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add YAML frontmatter with page metadata to markdown content
   */
  public addFrontmatter(markdownContent: string, metadata: PageMetadata): string {
    try {
      // First, strip any existing frontmatter to avoid duplication
      let content = markdownContent;
      if (content.startsWith('---')) {
        const lines = content.split('\n');
        let endIndex = -1;
        
        // Find the closing delimiter
        for (let i = 1; i < lines.length; i++) {
          if (lines[i] === '---') {
            endIndex = i;
            break;
          }
        }
        
        // If frontmatter found, remove it
        if (endIndex > 0) {
          const contentLines = lines.slice(endIndex + 1);
          // Remove leading empty lines
          while (contentLines.length > 0 && contentLines[0]?.trim() === '') {
            contentLines.shift();
          }
          content = contentLines.join('\n');
        }
      }

      // Create the metadata object with proper escaping
      const frontmatterData = {
        confluence: {
          pageId: String(metadata.pageId),
          spaceKey: metadata.spaceKey,
          title: metadata.title,
          status: metadata.status || null,
          version: metadata.version,
          lastModified: metadata.lastModified,
          author: metadata.author || null,
          parentId: metadata.parentId ? String(metadata.parentId) : null,
          parentType: metadata.parentType || null,
          url: metadata.url || null,
        },
      };

      // Generate YAML with proper formatting
      const yamlContent = yaml.stringify(frontmatterData, {
        indent: 2,
        lineWidth: 0,
        nullStr: 'null',
      });

      // Build the frontmatter with the DO NOT EDIT comment
      const frontmatter = [
        '---',
        '# DO NOT EDIT - Metadata from Confluence (read-only)',
        yamlContent.trim(),
        '---',
        '',
      ].join('\n');

      // Combine frontmatter with content
      return frontmatter + content;
    }
    catch (error) {
      logger.error('Failed to add frontmatter to markdown', error);
      // Return content without frontmatter if there's an error
      return markdownContent;
    }
  }

  /**
   * Pre-process Confluence-specific XHTML elements
   */
  private preprocessConfluenceElements(content: string): string {
    let processed = content;

    // Handle Confluence info/warning/note/tip panels
    // Store them temporarily and replace after conversion
    let panelIndex = this.panels.length;

    processed = processed.replace(
      /<ac:structured-macro[^>]*ac:name="(info|warning|note|tip)"[^>]*>[\s\S]*?<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>[\s\S]*?<\/ac:structured-macro>/g,
      (match, panelType, panelContent) => {
        const id = `__PANEL_${panelIndex++}__`;
        this.panels.push({ id, type: panelType, content: panelContent });
        // Replace with a placeholder that will survive markdown conversion
        return `<p>${id}</p>`;
      },
    );

    // Handle Confluence code blocks with language
    processed = processed.replace(
      /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:parameter[^>]*ac:name="language"[^>]*>([^<]*)<\/ac:parameter>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/g,
      (match, language, code) => {
        return `<pre><code class="language-${language}">${code}</code></pre>`;
      },
    );

    // Handle Confluence inline code (without language parameter)
    processed = processed.replace(
      /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/g,
      (match, code) => {
        return `<code>${code}</code>`;
      },
    );

    // Handle Confluence links
    processed = processed.replace(
      /<ac:link[^>]*>[\s\S]*?<ri:page[^>]*ri:content-title="([^"]*)"[^>]*\/>[\s\S]*?<ac:plain-text-link-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-link-body>[\s\S]*?<\/ac:link>/g,
      (match, title, text) => {
        return `<a href="#${title}">${text || title}</a>`;
      },
    );

    // Handle Confluence emoticons (convert to emoji or text)
    processed = processed.replace(
      /<ac:emoticon[^>]*ac:name="([^"]*)"[^>]*\/>/g,
      (match, name) => {
        const emojiMap: Record<string, string> = {
          'smile': '😊',
          'sad': '😢',
          'thumbs-up': '👍',
          'thumbs-down': '👎',
          'warning': '⚠️',
          'info': 'ℹ️',
          'tick': '✓',
          'cross': '✗',
        };
        return emojiMap[name] || `:${name}:`;
      },
    );

    // Handle Confluence rich text body
    processed = processed.replace(
      /<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/g,
      '$1',
    );

    // Handle Confluence layout sections
    processed = processed.replace(
      /<ac:layout[^>]*>([\s\S]*?)<\/ac:layout>/g,
      '$1',
    );
    processed = processed.replace(
      /<ac:layout-section[^>]*>([\s\S]*?)<\/ac:layout-section>/g,
      '$1',
    );
    processed = processed.replace(
      /<ac:layout-cell[^>]*>([\s\S]*?)<\/ac:layout-cell>/g,
      '$1',
    );

    return processed;
  }

  /**
   * Post-process the converted Markdown to clean up artifacts
   */
  private postprocessMarkdown(markdown: string): string {
    let cleaned = markdown;

    // Replace panel placeholders with proper markdown panels
    for (const panel of this.panels) {
      const panelMarkers: Record<string, string> = {
        info: '[!INFO]',
        warning: '[!WARNING]',
        note: '[!NOTE]',
        tip: '[!TIP]',
      };
      const marker = panelMarkers[panel.type.toLowerCase()] || '[!NOTE]';

      // Convert panel content to markdown first
      let panelMarkdown = '';
      try {
        const tempProcessor = unified()
          .use(rehypeParse, { fragment: true })
          .use(rehypeRemark)
          .use(remarkStringify);

        const result = tempProcessor.processSync(panel.content);
        panelMarkdown = String(result).trim();
      }
      catch {
        // Fallback to simple text extraction
        panelMarkdown = panel.content
          .replace(/<[^>]*>/g, '')
          .trim();
      }

      // Format as blockquote with marker
      const lines = panelMarkdown.split('\n');
      const quotedLines = lines.map((line, index) => {
        if (index === 0) {
          return `> ${marker}\n> ${line}`;
        }
        return `> ${line}`;
      }).join('\n');

      // Replace placeholder with formatted panel (handle escaped underscores)
      const escapedId = panel.id.replace(/_/g, '\\\\_');

      // Try multiple replacement approaches
      if (cleaned.includes(escapedId)) {
        cleaned = cleaned.replace(escapedId, quotedLines);
      }
      else if (cleaned.includes(panel.id)) {
        cleaned = cleaned.replace(panel.id, quotedLines);
      }
      else {
        // If neither works, try a regex to match the panel with any escaping
        const regexPattern = panel.id.replace(/_/g, '[\\\\_]*_[\\\\_]*');
        const regex = new RegExp(regexPattern, 'g');
        cleaned = cleaned.replace(regex, quotedLines);
      }
    }

    // Process tables to ensure proper alignment
    cleaned = this.processTableAlignment(cleaned);

    // Remove excessive blank lines (more than 2 consecutive)
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

    // Ensure headers have blank lines around them
    cleaned = cleaned.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
    cleaned = cleaned.replace(/(#{1,6} [^\n]+)\n([^\n])/g, '$1\n\n$2');

    // Fix list formatting
    cleaned = cleaned.replace(/^(\s*)[*+] /gm, '$1- ');

    // Ensure code blocks have blank lines around them
    cleaned = cleaned.replace(/([^\n])\n```/g, '$1\n\n```');
    cleaned = cleaned.replace(/```\n([^\n])/g, '```\n\n$1');

    // Trim trailing whitespace from lines
    cleaned = cleaned.split('\n').map(line => line.trimEnd()).join('\n');

    // Ensure file ends with single newline
    cleaned = `${cleaned.trim()}\n`;

    return cleaned;
  }

  /**
   * Process table alignment in Markdown
   */
  private processTableAlignment(markdown: string): string {
    const lines = markdown.split('\n');
    let inTable = false;
    let tableLines: string[] = [];
    const result: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line)
        continue;

      // Check if line is a table row
      if (line.includes('|')) {
        if (!inTable) {
          inTable = true;
          tableLines = [];
        }
        tableLines.push(line);
      }
      else if (inTable) {
        // Process completed table
        const alignedTable = this.alignTable(tableLines);
        result.push(...alignedTable);
        tableLines = [];
        inTable = false;
        result.push(line);
      }
      else {
        result.push(line);
      }
    }

    // Handle table at end of document
    if (inTable && tableLines.length > 0) {
      const alignedTable = this.alignTable(tableLines);
      result.push(...alignedTable);
    }

    return result.join('\n');
  }

  /**
   * Align table columns for better readability
   */
  private alignTable(tableLines: string[]): string[] {
    if (tableLines.length < 2)
      return tableLines;

    // Parse table cells
    const rows = tableLines.map(line =>
      line.split('|').map(cell => cell.trim()).filter(cell => cell !== ''),
    );

    if (rows.length === 0)
      return tableLines;

    // Calculate column widths
    const colCount = Math.max(...rows.map(row => row.length));
    const colWidths = Array.from({ length: colCount }, () => 0);

    rows.forEach((row) => {
      row.forEach((cell, index) => {
        // Check if it's a separator row
        const cleanCell = cell.replace(/^:?-+:?$/, '---');
        const currentWidth = colWidths[index] ?? 0;
        colWidths[index] = Math.max(currentWidth, cleanCell.length);
      });
    });

    // Format rows with aligned columns
    const aligned = rows.map((row, rowIndex) => {
      const cells = row.map((cell, index) => {
        // Handle separator row
        if (rowIndex === 1 && /^:?-+:?$/.test(cell)) {
          const align = cell.startsWith(':') && cell.endsWith(':')
            ? 'center'
            : cell.endsWith(':') ? 'right' : 'left';
          const width = colWidths[index] ?? 3;
          const dashes = '-'.repeat(Math.max(3, width));

          if (align === 'center')
            return `:${dashes}:`;
          if (align === 'right')
            return `${dashes}:`;
          return dashes;
        }
        // Regular cell - pad to column width
        const width = colWidths[index] ?? 0;
        return cell.padEnd(width);
      });

      return `| ${cells.join(' | ')} |`;
    });

    return aligned;
  }
}
