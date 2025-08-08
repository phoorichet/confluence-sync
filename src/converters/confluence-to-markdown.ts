import rehypeParse from 'rehype-parse';
import rehypeRemark from 'rehype-remark';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { logger } from '../utils/logger.js';

export class ConfluenceToMarkdownConverter {
  private processor;

  constructor() {
    // Set up unified processor for HTML to Markdown conversion
    this.processor = unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeRemark)
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
  async convert(confluenceContent: string): Promise<string> {
    try {
      if (!confluenceContent || confluenceContent.trim().length === 0) {
        return '';
      }

      // Pre-process Confluence-specific elements
      const preprocessed = this.preprocessConfluenceElements(confluenceContent);

      // Convert to Markdown using unified
      const result = await this.processor.process(preprocessed);
      const markdown = String(result);

      // Post-process to clean up any artifacts
      const cleaned = this.postprocessMarkdown(markdown);

      return cleaned;
    }
    catch (error) {
      logger.error('Failed to convert Confluence content to Markdown', error);
      throw new Error(`CS-500: Failed to convert content: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pre-process Confluence-specific XHTML elements
   */
  private preprocessConfluenceElements(content: string): string {
    let processed = content;

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
}
