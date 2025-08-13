import { beforeEach, describe, expect, it } from 'vitest';
import { ConfluenceToMarkdownConverter } from '../../../src/converters/confluence-to-markdown';

describe('confluenceToMarkdownConverter', () => {
  let converter: ConfluenceToMarkdownConverter;

  beforeEach(() => {
    converter = new ConfluenceToMarkdownConverter();
  });

  describe('addFrontmatter', () => {
    it('should add YAML frontmatter with complete metadata', () => {
      const metadata = {
        pageId: '123456',
        spaceKey: 'PROJ',
        title: 'Page Title',
        version: 5,
        lastModified: '2024-01-15T10:30:00Z',
        author: 'john.doe@example.com',
        parentId: '789012',
        url: 'https://instance.atlassian.net/wiki/spaces/PROJ/pages/123456',
      };

      const content = '# Test Content\n\nThis is the page content.';
      const result = converter.addFrontmatter(content, metadata);

      expect(result).toContain('---');
      expect(result).toContain('# DO NOT EDIT - Metadata from Confluence (read-only)');
      expect(result).toContain('confluence:');
      expect(result).toContain('pageId: "123456"');
      expect(result).toContain('spaceKey: PROJ');
      expect(result).toContain('title: Page Title');
      expect(result).toContain('version: 5');
      expect(result).toContain('lastModified: 2024-01-15T10:30:00Z');
      expect(result).toContain('author: john.doe@example.com');
      expect(result).toContain('parentId: "789012"');
      expect(result).toContain('url: https://instance.atlassian.net/wiki/spaces/PROJ/pages/123456');
      expect(result).toContain('# Test Content');
    });

    it('should handle metadata with missing optional fields', () => {
      const metadata = {
        pageId: '123456',
        spaceKey: 'PROJ',
        title: 'Page Title',
        version: 1,
        lastModified: '2024-01-15T10:30:00Z',
      };

      const content = '# Content';
      const result = converter.addFrontmatter(content, metadata);

      expect(result).toContain('pageId: "123456"');
      expect(result).toContain('author: null');
      expect(result).toContain('parentId: null');
      expect(result).toContain('url: null');
    });

    it('should escape special characters in YAML values', () => {
      const metadata = {
        pageId: '123456',
        spaceKey: 'PROJ',
        title: 'Title with "quotes" and: colons',
        version: 1,
        lastModified: '2024-01-15T10:30:00Z',
        author: 'user@domain.com',
      };

      const content = '# Content';
      const result = converter.addFrontmatter(content, metadata);

      expect(result).toContain('title: \'Title with "quotes" and: colons\'');
    });

    it('should convert with metadata in convert method', async () => {
      const metadata = {
        pageId: '123456',
        spaceKey: 'PROJ',
        title: 'Test Page',
        version: 2,
        lastModified: '2024-01-15T10:30:00Z',
      };

      const html = '<h1>Title</h1><p>Content</p>';
      const result = await converter.convert(html, metadata);

      expect(result).toContain('---');
      expect(result).toContain('# DO NOT EDIT - Metadata from Confluence (read-only)');
      expect(result).toContain('pageId: "123456"');
      expect(result).toContain('# Title');
      expect(result).toContain('Content');
    });

    it('should replace existing frontmatter when adding new metadata', () => {
      const existingContent = `---
# DO NOT EDIT - Metadata from Confluence (read-only)
confluence:
  pageId: "OLD123"
  spaceKey: OLDPROJ
  title: Old Title
  version: 1
  lastModified: 2024-01-01T00:00:00Z
  author: null
  parentId: null
  url: null
---

# Actual Content

This is the page content.`;

      const newMetadata = {
        pageId: 'NEW456',
        spaceKey: 'NEWPROJ',
        title: 'New Title',
        version: 2,
        lastModified: '2024-12-15T10:30:00Z',
        author: 'new.user@example.com',
        parentId: '789',
        url: 'https://new.url/page',
      };

      const result = converter.addFrontmatter(existingContent, newMetadata);

      // Should only have one set of frontmatter
      const frontmatterCount = (result.match(/^---$/gm) || []).length;
      expect(frontmatterCount).toBe(2); // Only opening and closing

      // Should contain new metadata
      expect(result).toContain('pageId: NEW456');
      expect(result).toContain('spaceKey: NEWPROJ');
      expect(result).toContain('title: New Title');
      expect(result).toContain('version: 2');
      
      // Should NOT contain old metadata
      expect(result).not.toContain('OLD123');
      expect(result).not.toContain('OLDPROJ');
      expect(result).not.toContain('Old Title');
      
      // Should preserve actual content
      expect(result).toContain('# Actual Content');
      expect(result).toContain('This is the page content.');
    });
  });

  describe('convert', () => {
    it('should convert empty content', async () => {
      const result = await converter.convert('');
      expect(result).toBe('');
    });

    it('should convert basic HTML elements', async () => {
      const html = '<h1>Title</h1><p>Paragraph text</p>';
      const result = await converter.convert(html);
      expect(result).toContain('# Title');
      expect(result).toContain('Paragraph text');
    });

    it('should convert headers (h1-h6)', async () => {
      const html = `
        <h1>Heading 1</h1>
        <h2>Heading 2</h2>
        <h3>Heading 3</h3>
        <h4>Heading 4</h4>
        <h5>Heading 5</h5>
        <h6>Heading 6</h6>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('# Heading 1');
      expect(result).toContain('## Heading 2');
      expect(result).toContain('### Heading 3');
      expect(result).toContain('#### Heading 4');
      expect(result).toContain('##### Heading 5');
      expect(result).toContain('###### Heading 6');
    });

    it('should convert text formatting', async () => {
      const html = `
        <p><strong>Bold text</strong></p>
        <p><em>Italic text</em></p>
        <p><u>Underlined text</u></p>
        <p><code>Inline code</code></p>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('**Bold text**');
      expect(result).toContain('*Italic text*');
      expect(result).toContain('Underlined text'); // Underline not supported in standard Markdown
      expect(result).toContain('`Inline code`');
    });

    it('should convert unordered lists', async () => {
      const html = `
        <ul>
          <li>Item 1</li>
          <li>Item 2</li>
          <li>Item 3</li>
        </ul>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('- Item 1');
      expect(result).toContain('- Item 2');
      expect(result).toContain('- Item 3');
    });

    it('should convert ordered lists', async () => {
      const html = `
        <ol>
          <li>First item</li>
          <li>Second item</li>
          <li>Third item</li>
        </ol>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('1. First item');
      expect(result).toContain('2. Second item');
      expect(result).toContain('3. Third item');
    });

    it('should convert nested lists', async () => {
      const html = `
        <ul>
          <li>Parent 1
            <ul>
              <li>Child 1.1</li>
              <li>Child 1.2</li>
            </ul>
          </li>
          <li>Parent 2</li>
        </ul>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('- Parent 1');
      expect(result).toMatch(/\s+- Child 1\.1/);
      expect(result).toMatch(/\s+- Child 1\.2/);
      expect(result).toContain('- Parent 2');
    });

    it('should convert links', async () => {
      const html = `
        <p><a href="https://example.com">External link</a></p>
        <p><a href="/wiki/page">Internal link</a></p>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('[External link](https://example.com)');
      expect(result).toContain('[Internal link](/wiki/page)');
    });

    it('should convert code blocks', async () => {
      const html = `
        <pre><code class="language-javascript">function hello() {
  console.log("Hello, World!");
}</code></pre>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('```javascript');
      expect(result).toContain('function hello()');
      expect(result).toContain('console.log("Hello, World!")');
      expect(result).toContain('```');
    });

    it('should convert Confluence code macro', async () => {
      const confluenceHtml = `
        <ac:structured-macro ac:name="code">
          <ac:parameter ac:name="language">python</ac:parameter>
          <ac:plain-text-body><![CDATA[def hello():
    print("Hello, World!")]]></ac:plain-text-body>
        </ac:structured-macro>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('```python');
      expect(result).toContain('def hello():');
      expect(result).toContain('print("Hello, World!")');
      expect(result).toContain('```');
    });

    it('should convert Confluence inline code', async () => {
      const confluenceHtml = `
        <p>Use the <ac:structured-macro ac:name="code">
          <ac:plain-text-body><![CDATA[npm install]]></ac:plain-text-body>
        </ac:structured-macro> command</p>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('`npm install`');
    });

    it('should convert Confluence links', async () => {
      const confluenceHtml = `
        <ac:link>
          <ri:page ri:content-title="Other Page"/>
          <ac:plain-text-link-body><![CDATA[Link to other page]]></ac:plain-text-link-body>
        </ac:link>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('[Link to other page](<#Other Page>)');
    });

    it('should convert Confluence emoticons', async () => {
      const confluenceHtml = `
        <p>Good job <ac:emoticon ac:name="thumbs-up"/> and be careful <ac:emoticon ac:name="warning"/></p>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('👍');
      expect(result).toContain('⚠️');
    });

    it('should handle Confluence layout elements', async () => {
      const confluenceHtml = `
        <ac:layout>
          <ac:layout-section>
            <ac:layout-cell>
              <p>Content in layout</p>
            </ac:layout-cell>
          </ac:layout-section>
        </ac:layout>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('Content in layout');
      expect(result).not.toContain('ac:layout');
    });

    it('should clean up excessive blank lines', async () => {
      const html = `
        <h1>Title</h1>



        <p>Paragraph</p>



        <h2>Subtitle</h2>
      `;
      const result = await converter.convert(html);
      // Should have max 2 consecutive newlines
      expect(result).not.toMatch(/\n{3,}/);
    });

    it('should convert Confluence info panels', async () => {
      const confluenceHtml = `
        <ac:structured-macro ac:name="info">
          <ac:rich-text-body>
            <p>This is important information</p>
          </ac:rich-text-body>
        </ac:structured-macro>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('> [!INFO]');
      expect(result).toContain('> This is important information');
    });

    it('should convert Confluence warning panels', async () => {
      const confluenceHtml = `
        <ac:structured-macro ac:name="warning">
          <ac:rich-text-body>
            <p>Warning message</p>
          </ac:rich-text-body>
        </ac:structured-macro>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('> [!WARNING]');
      expect(result).toContain('> Warning message');
    });

    it('should convert Confluence note panels', async () => {
      const confluenceHtml = `
        <ac:structured-macro ac:name="note">
          <ac:rich-text-body>
            <p>Note content</p>
          </ac:rich-text-body>
        </ac:structured-macro>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('> [!NOTE]');
      expect(result).toContain('> Note content');
    });

    it('should convert Confluence tip panels', async () => {
      const confluenceHtml = `
        <ac:structured-macro ac:name="tip">
          <ac:rich-text-body>
            <p>Helpful tip</p>
          </ac:rich-text-body>
        </ac:structured-macro>
      `;
      const result = await converter.convert(confluenceHtml);
      expect(result).toContain('> [!TIP]');
      expect(result).toContain('> Helpful tip');
    });

    it('should align table columns properly', async () => {
      const html = `
        <table>
          <tr>
            <th>Short</th>
            <th>Medium Length</th>
            <th>Very Long Header</th>
          </tr>
          <tr>
            <td>A</td>
            <td>B</td>
            <td>C</td>
          </tr>
        </table>
      `;
      const result = await converter.convert(html);
      // Check that table is present and formatted
      expect(result).toContain('| Short');
      expect(result).toContain('| Medium Length');
      expect(result).toContain('| Very Long Header');
      expect(result).toMatch(/\|\s+A\s+\|/);
      expect(result).toMatch(/\|\s+B\s+\|/);
      expect(result).toMatch(/\|\s+C\s+\|/);
    });

    it('should handle deeply nested lists', async () => {
      const html = `
        <ul>
          <li>Level 1
            <ul>
              <li>Level 2
                <ul>
                  <li>Level 3
                    <ul>
                      <li>Level 4
                        <ul>
                          <li>Level 5
                            <ul>
                              <li>Level 6</li>
                            </ul>
                          </li>
                        </ul>
                      </li>
                    </ul>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('- Level 1');
      expect(result).toContain('Level 2');
      expect(result).toContain('Level 3');
      expect(result).toContain('Level 4');
      expect(result).toContain('Level 5');
      expect(result).toContain('Level 6');
    });

    it('should handle mixed nested lists', async () => {
      const html = `
        <ol>
          <li>Ordered parent
            <ul>
              <li>Unordered child 1</li>
              <li>Unordered child 2</li>
            </ul>
          </li>
          <li>Another ordered
            <ol>
              <li>Nested ordered</li>
            </ol>
          </li>
        </ol>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('1. Ordered parent');
      expect(result).toContain('- Unordered child 1');
      expect(result).toContain('- Unordered child 2');
      expect(result).toContain('2. Another ordered');
      expect(result).toContain('1. Nested ordered');
    });

    it('should handle tables with empty cells', async () => {
      const html = `
        <table>
          <tr>
            <th>A</th>
            <th>B</th>
            <th>C</th>
          </tr>
          <tr>
            <td>1</td>
            <td></td>
            <td>3</td>
          </tr>
          <tr>
            <td></td>
            <td>2</td>
            <td></td>
          </tr>
        </table>
      `;
      const result = await converter.convert(html);
      expect(result).toContain('| A');
      expect(result).toContain('| B');
      expect(result).toContain('| C');
      // The markdown processor may handle empty cells differently
      // Check that table structure is preserved
      expect(result).toContain('| 1');
      expect(result).toContain('| 3');
      expect(result).toContain('| 2');
    });

    it('should ensure headers have blank lines around them', async () => {
      const html = '<p>Text before</p><h2>Header</h2><p>Text after</p>';
      const result = await converter.convert(html);
      expect(result).toMatch(/Text before\n\n## Header\n\n/);
    });

    it('should normalize list markers', async () => {
      const html = `
        <ul>
          <li>Item with asterisk</li>
          <li>Item with plus</li>
          <li>Item with dash</li>
        </ul>
      `;
      const result = await converter.convert(html);
      // All list items should use dash
      const lines = result.split('\n');
      const listLines = lines.filter(line => line.trim().startsWith('-'));
      expect(listLines).toHaveLength(3);
    });

    it('should handle complex nested content', async () => {
      const html = `
        <h1>Main Title</h1>
        <p>Introduction with <strong>bold</strong> and <em>italic</em> text.</p>
        <h2>Section 1</h2>
        <ul>
          <li>Point 1 with <code>inline code</code></li>
          <li>Point 2
            <ol>
              <li>Subpoint A</li>
              <li>Subpoint B</li>
            </ol>
          </li>
        </ul>
        <pre><code>Code block
with multiple lines</code></pre>
        <p>Conclusion with a <a href="https://example.com">link</a>.</p>
      `;
      const result = await converter.convert(html);

      expect(result).toContain('# Main Title');
      expect(result).toContain('**bold**');
      expect(result).toContain('*italic*');
      expect(result).toContain('## Section 1');
      expect(result).toContain('`inline code`');
      expect(result).toContain('1. Subpoint A');
      expect(result).toContain('```');
      expect(result).toContain('[link](https://example.com)');
    });

    it('should handle malformed HTML gracefully', async () => {
      const malformedHtml = '<p>Unclosed paragraph <strong>bold text</p>';
      const result = await converter.convert(malformedHtml);
      expect(result).toContain('Unclosed paragraph');
      expect(result).toContain('bold text');
    });

    it('should escape HTML entities correctly', async () => {
      const html = '<p>&lt;script&gt;alert("XSS")&lt;/script&gt;</p>';
      const result = await converter.convert(html);
      expect(result).toContain('\\<script>alert("XSS")\\</script>');
    });
  });
});
