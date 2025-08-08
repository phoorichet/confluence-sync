import { describe, expect, it } from 'bun:test';
import { MarkdownToConfluenceConverter } from '../../../src/converters/markdown-to-confluence';

describe('MarkdownToConfluenceConverter', () => {
  const converter = new MarkdownToConfluenceConverter();

  describe('convert', () => {
    it('should convert headers (h1-h6)', async () => {
      const markdown = `# Heading 1
## Heading 2
### Heading 3
#### Heading 4
##### Heading 5
###### Heading 6`;

      const result = await converter.convert(markdown);

      expect(result).toContain('<h1>Heading 1</h1>');
      expect(result).toContain('<h2>Heading 2</h2>');
      expect(result).toContain('<h3>Heading 3</h3>');
      expect(result).toContain('<h4>Heading 4</h4>');
      expect(result).toContain('<h5>Heading 5</h5>');
      expect(result).toContain('<h6>Heading 6</h6>');
    });

    it('should convert paragraphs', async () => {
      const markdown = `This is a paragraph.

This is another paragraph.`;

      const result = await converter.convert(markdown);

      expect(result).toContain('<p>This is a paragraph.</p>');
      expect(result).toContain('<p>This is another paragraph.</p>');
    });

    it('should convert bold text', async () => {
      const markdown = '**bold text** and **more bold**';

      const result = await converter.convert(markdown);

      expect(result).toContain('<strong>bold text</strong>');
      expect(result).toContain('<strong>more bold</strong>');
    });

    it('should convert italic text', async () => {
      const markdown = '*italic text* and _also italic_';

      const result = await converter.convert(markdown);

      expect(result).toContain('<em>italic text</em>');
      expect(result).toContain('<em>also italic</em>');
    });

    it('should convert strikethrough text', async () => {
      const markdown = '~~strikethrough text~~';

      const result = await converter.convert(markdown);

      expect(result).toContain('<del>strikethrough text</del>');
    });

    it('should convert inline code', async () => {
      const markdown = 'Use `const x = 5` in your code';

      const result = await converter.convert(markdown);

      expect(result).toContain('<code>const x = 5</code>');
    });

    it('should convert code blocks with language', async () => {
      const markdown = `\`\`\`javascript
const x = 5;
console.log(x);
\`\`\``;

      const result = await converter.convert(markdown);

      expect(result).toContain('<ac:structured-macro ac:name="code">');
      expect(result).toContain('<ac:parameter ac:name="language">javascript</ac:parameter>');
      expect(result).toContain('<![CDATA[const x = 5;');
      expect(result).toContain('console.log(x);]]>');
    });

    it('should convert code blocks without language', async () => {
      const markdown = `\`\`\`
plain code block
\`\`\``;

      const result = await converter.convert(markdown);

      expect(result).toContain('<ac:structured-macro ac:name="code">');
      expect(result).toContain('<![CDATA[plain code block]]>');
      expect(result).not.toContain('ac:parameter ac:name="language"');
    });

    it('should convert unordered lists', async () => {
      const markdown = `- Item 1
- Item 2
- Item 3`;

      const result = await converter.convert(markdown);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Item 1</li>');
      expect(result).toContain('<li>Item 2</li>');
      expect(result).toContain('<li>Item 3</li>');
      expect(result).toContain('</ul>');
    });

    it('should convert ordered lists', async () => {
      const markdown = `1. First item
2. Second item
3. Third item`;

      const result = await converter.convert(markdown);

      expect(result).toContain('<ol>');
      expect(result).toContain('<li>First item</li>');
      expect(result).toContain('<li>Second item</li>');
      expect(result).toContain('<li>Third item</li>');
      expect(result).toContain('</ol>');
    });

    it('should convert nested lists', async () => {
      const markdown = `- Level 1
  - Level 2
    - Level 3
  - Another Level 2
- Back to Level 1`;

      const result = await converter.convert(markdown);

      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Level 1<ul>');
      expect(result).toContain('<li>Level 2<ul>');
      expect(result).toContain('<li>Level 3</li>');
    });

    it('should convert external links', async () => {
      const markdown = '[Google](https://www.google.com)';

      const result = await converter.convert(markdown);

      expect(result).toContain('<a href="https://www.google.com">Google</a>');
    });

    it('should convert links with titles', async () => {
      const markdown = '[Example](https://example.com "Example Title")';

      const result = await converter.convert(markdown);

      expect(result).toContain('<a href="https://example.com" title="Example Title">Example</a>');
    });

    it('should convert internal links', async () => {
      const markdown = '[Internal Page](#section)';

      const result = await converter.convert(markdown);

      expect(result).toContain('<a href="#section">Internal Page</a>');
    });

    it('should convert images as attachments', async () => {
      const markdown = '![Alt text](image.png)';

      const result = await converter.convert(markdown);

      expect(result).toContain('<ac:image>');
      expect(result).toContain('<ri:attachment ri:filename="image.png" />');
      expect(result).toContain('</ac:image>');
    });

    it('should convert blockquotes', async () => {
      const markdown = '> This is a quote\n> with multiple lines';

      const result = await converter.convert(markdown);

      expect(result).toContain('<blockquote>');
      expect(result).toContain('This is a quote');
      expect(result).toContain('with multiple lines');
      expect(result).toContain('</blockquote>');
    });

    it('should convert horizontal rules', async () => {
      const markdown = '---';

      const result = await converter.convert(markdown);

      expect(result).toContain('<hr/>');
    });

    it('should convert tables', async () => {
      const markdown = `| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
| Cell 3   | Cell 4   |`;

      const result = await converter.convert(markdown);

      expect(result).toContain('<table>');
      expect(result).toContain('<tbody>');
      expect(result).toContain('<th>Header 1</th>');
      expect(result).toContain('<th>Header 2</th>');
      expect(result).toContain('<td>Cell 1</td>');
      expect(result).toContain('<td>Cell 2</td>');
      expect(result).toContain('</tbody>');
      expect(result).toContain('</table>');
    });

    it('should escape HTML entities', async () => {
      const markdown = 'Text with < and > and & and "quotes"';

      const result = await converter.convert(markdown);

      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;');
    });

    it('should handle complex mixed content', async () => {
      const markdown = `# Main Title

This is a paragraph with **bold** and *italic* text.

## Section with Code

Here's some \`inline code\` and a block:

\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`

### Lists

- Item with **bold**
- Item with [link](https://example.com)
  - Nested item
  - Another nested

> Quote with *emphasis*

---

| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |`;

      const result = await converter.convert(markdown);

      // Check major elements are present
      expect(result).toContain('<h1>Main Title</h1>');
      expect(result).toContain('<h2>Section with Code</h2>');
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<code>inline code</code>');
      expect(result).toContain('<ac:structured-macro ac:name="code">');
      expect(result).toContain('<ul>');
      expect(result).toContain('<blockquote>');
      expect(result).toContain('<hr/>');
      expect(result).toContain('<table>');
    });
  });
});
