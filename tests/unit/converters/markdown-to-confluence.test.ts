import { beforeEach, describe, expect, it } from 'vitest';
import { MarkdownToConfluenceConverter } from '../../../src/converters/markdown-to-confluence';

describe('MarkdownToConfluenceConverter', () => {
  let converter: MarkdownToConfluenceConverter;

  beforeEach(() => {
    converter = new MarkdownToConfluenceConverter();
  });

  describe('basic conversions', () => {
    it('should convert empty content', async () => {
      const result = await converter.convert('');
      expect(result).toBe('');
    });

    it('should convert headings', async () => {
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
      const markdown = 'This is a paragraph.\n\nThis is another paragraph.';
      const result = await converter.convert(markdown);
      expect(result).toContain('<p>This is a paragraph.</p>');
      expect(result).toContain('<p>This is another paragraph.</p>');
    });

    it('should convert text formatting', async () => {
      const markdown = '**bold** *italic* ~~strikethrough~~ `inline code`';
      const result = await converter.convert(markdown);
      expect(result).toContain('<strong>bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<del>strikethrough</del>');
      expect(result).toContain('<code>inline code</code>');
    });
  });

  describe('list conversions', () => {
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
      const markdown = `1. First
2. Second
3. Third`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<ol>');
      expect(result).toContain('<li>First</li>');
      expect(result).toContain('<li>Second</li>');
      expect(result).toContain('<li>Third</li>');
      expect(result).toContain('</ol>');
    });

    it('should convert nested lists', async () => {
      const markdown = `- Parent 1
  - Child 1.1
  - Child 1.2
    - Grandchild 1.2.1
- Parent 2`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<ul>');
      expect(result).toContain('<li>Parent 1<ul>');
      expect(result).toContain('<li>Child 1.1</li>');
      expect(result).toContain('<li>Child 1.2<ul>');
      expect(result).toContain('<li>Grandchild 1.2.1</li>');
    });

    it('should convert mixed nested lists', async () => {
      const markdown = `1. Ordered parent
   - Unordered child 1
   - Unordered child 2
2. Another ordered parent
   1. Ordered sub-item
   2. Another ordered sub-item`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<ol>');
      expect(result).toContain('<ul>');
      expect(result).toContain('Ordered parent');
      expect(result).toContain('Unordered child 1');
    });

    it('should support deep nesting (6 levels)', async () => {
      const markdown = `- L1
  - L2
    - L3
      - L4
        - L5
          - L6`;

      const result = await converter.convert(markdown);
      expect(result).toContain('L1');
      expect(result).toContain('L2');
      expect(result).toContain('L3');
      expect(result).toContain('L4');
      expect(result).toContain('L5');
      expect(result).toContain('L6');
      // Check for nested <ul> tags
      const ulCount = (result.match(/<ul>/g) || []).length;
      expect(ulCount).toBe(6);
    });
  });

  describe('code block conversions', () => {
    it('should convert code blocks without language', async () => {
      const markdown = '```\nconst x = 42;\n```';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:structured-macro ac:name="code">');
      expect(result).toContain('<ac:plain-text-body><![CDATA[const x = 42;]]></ac:plain-text-body>');
      expect(result).not.toContain('ac:parameter');
    });

    it('should convert code blocks with language hints', async () => {
      const markdown = '```javascript\nconst x = 42;\n```';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:structured-macro ac:name="code">');
      expect(result).toContain('<ac:parameter ac:name="language">javascript</ac:parameter>');
      expect(result).toContain('<ac:plain-text-body><![CDATA[const x = 42;]]></ac:plain-text-body>');
    });

    it('should support various programming languages', async () => {
      const languages = ['python', 'java', 'typescript', 'sql', 'bash', 'yaml', 'json', 'xml', 'cpp', 'csharp', 'ruby', 'go', 'rust', 'swift'];

      for (const lang of languages) {
        const markdown = `\`\`\`${lang}\ncode here\n\`\`\``;
        const result = await converter.convert(markdown);
        expect(result).toContain(`<ac:parameter ac:name="language">${lang}</ac:parameter>`);
      }
    });
  });

  describe('table conversions', () => {
    it('should convert simple tables with proper headers', async () => {
      const markdown = `| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |
| Cell 3 | Cell 4 |`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<table>');
      expect(result).toContain('<thead>');
      expect(result).toContain('<th>Header 1</th>');
      expect(result).toContain('<th>Header 2</th>');
      expect(result).toContain('</thead>');
      expect(result).toContain('<tbody>');
      expect(result).toContain('<td>Cell 1</td>');
      expect(result).toContain('<td>Cell 2</td>');
      expect(result).toContain('</tbody></table>');
    });

    it('should handle tables with alignment', async () => {
      const markdown = `| Left | Center | Right |
| :--- | :---: | ---: |
| L1 | C1 | R1 |`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<table>');
      expect(result).toContain('<th>Left</th>');
      expect(result).toContain('<th>Center</th>');
      expect(result).toContain('<th>Right</th>');
      expect(result).toContain('<td>L1</td>');
      expect(result).not.toContain('---'); // Separator should not appear in output
    });

    it('should handle tables with empty cells', async () => {
      const markdown = `| A | B | C |
| --- | --- | --- |
| 1 | | 3 |
| | 2 | |`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<td>1</td>');
      expect(result).toContain('<td></td>');
      expect(result).toContain('<td>3</td>');
      expect(result).toContain('<td>2</td>');
    });

    it('should handle complex table content', async () => {
      const markdown = `| Feature | **Status** | Notes |
| --- | --- | --- |
| Tables | ✅ | With *formatting* |
| Links | ✅ | [Example](https://example.com) |
| Code | ✅ | \`inline\` |`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<th>Feature</th>');
      expect(result).toContain('<th><strong>Status</strong></th>');
      expect(result).toContain('<td>✅</td>');
      expect(result).toContain('<em>formatting</em>');
      expect(result).toContain('<a href="https://example.com">Example</a>');
      expect(result).toContain('<code>inline</code>');
    });
  });

  describe('link conversions', () => {
    it('should convert external links', async () => {
      const markdown = '[Google](https://www.google.com)';
      const result = await converter.convert(markdown);
      expect(result).toContain('<a href="https://www.google.com">Google</a>');
    });

    it('should convert internal page links', async () => {
      const markdown = '[Page Link](page.md)';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:link>');
      expect(result).toContain('<ri:page ri:content-title="page" />');
      expect(result).toContain('<ac:plain-text-link-body><![CDATA[Page Link]]></ac:plain-text-link-body>');
    });

    it('should convert anchor links', async () => {
      const markdown = '[Section](#section-id)';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:link ac:anchor="section-id">');
      expect(result).toContain('<ac:plain-text-link-body><![CDATA[Section]]></ac:plain-text-link-body>');
    });

    it('should convert wiki-style links', async () => {
      const markdown = '[Wiki Page](/wiki/WikiPage)';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:link>');
      expect(result).toContain('<ri:page ri:content-title="WikiPage" />');
    });

    it('should escape special characters in URLs', async () => {
      const markdown = '[Test](https://example.com?a=1&b=2)';
      const result = await converter.convert(markdown);
      expect(result).toContain('a=1&amp;b=2');
    });
  });

  describe('image conversions', () => {
    it('should convert local images as attachments', async () => {
      const markdown = '![Alt text](image.png)';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:image>');
      expect(result).toContain('<ri:attachment ri:filename="image.png" />');
      expect(result).toContain('<ac:caption>Alt text</ac:caption>');
    });

    it('should convert external images', async () => {
      const markdown = '![External](https://example.com/image.jpg)';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:image>');
      expect(result).toContain('<ri:url ri:value="https://example.com/image.jpg" />');
      expect(result).toContain('<ac:caption>External</ac:caption>');
    });

    it('should preserve relative paths', async () => {
      const markdown = '![Image](../assets/image.png)';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ri:attachment ri:filename="image.png" />');
    });

    it('should handle images with titles', async () => {
      const markdown = '![Alt](image.png "Image Title")';
      const result = await converter.convert(markdown);
      expect(result).toContain('ac:title="Image Title"');
    });

    it('should handle images without alt text', async () => {
      const markdown = '![](image.png)';
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:image>');
      expect(result).not.toContain('<ac:caption>');
    });
  });

  describe('panel conversions', () => {
    it('should convert info panels', async () => {
      const markdown = `> [!INFO]
> This is info content`;
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:structured-macro ac:name="info">');
      expect(result).toContain('<ac:rich-text-body>');
      expect(result).toContain('This is info content');
      expect(result).toContain('</ac:rich-text-body>');
    });

    it('should convert warning panels', async () => {
      const markdown = `> [!WARNING]
> Warning message here`;
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:structured-macro ac:name="warning">');
      expect(result).toContain('Warning message here');
    });

    it('should convert note panels', async () => {
      const markdown = `> [!NOTE]
> Note content`;
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:structured-macro ac:name="note">');
      expect(result).toContain('Note content');
    });

    it('should convert tip panels', async () => {
      const markdown = `> [!TIP]
> Helpful tip`;
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:structured-macro ac:name="tip">');
      expect(result).toContain('Helpful tip');
    });

    it('should handle regular blockquotes', async () => {
      const markdown = '> This is a regular quote';
      const result = await converter.convert(markdown);
      expect(result).toContain('<blockquote>');
      expect(result).toContain('This is a regular quote');
      expect(result).toContain('</blockquote>');
      expect(result).not.toContain('ac:structured-macro');
    });

    it('should handle multi-line panels', async () => {
      const markdown = `> [!WARNING]
> Line 1 of warning
> Line 2 of warning
> Line 3 of warning`;
      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:structured-macro ac:name="warning">');
      expect(result).toContain('Line 1 of warning');
      expect(result).toContain('Line 2 of warning');
      expect(result).toContain('Line 3 of warning');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters', async () => {
      const markdown = 'Text with \\<special\\> & "characters" \'quotes\'';
      const result = await converter.convert(markdown);
      expect(result).toContain('&lt;special&gt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;characters&quot;');
      expect(result).toContain('&#39;quotes&#39;');
    });

    it('should handle deeply nested structures', async () => {
      const markdown = `> [!NOTE]
> - List in panel
>   - Nested item
>     - Deep nested
>       - Even deeper`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<ac:structured-macro ac:name="note">');
      expect(result).toContain('<ul>');
      expect(result).toContain('List in panel');
    });

    it('should handle mixed content', async () => {
      const markdown = `# Title

This is a **paragraph** with *formatting*.

\`\`\`javascript
const code = "block";
\`\`\`

| Table | Header |
| --- | --- |
| Cell | Value |

> [!WARNING]
> Warning panel

[Link](https://example.com) and ![Image](image.png)`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<h1>Title</h1>');
      expect(result).toContain('<strong>paragraph</strong>');
      expect(result).toContain('<ac:structured-macro ac:name="code">');
      expect(result).toContain('<table>');
      expect(result).toContain('<ac:structured-macro ac:name="warning">');
      expect(result).toContain('<a href="https://example.com">');
      expect(result).toContain('<ac:image>');
    });

    it('should handle malformed markdown gracefully', async () => {
      const markdown = '**unclosed bold *mixed* formatting';
      const result = await converter.convert(markdown);
      expect(result).toBeTruthy();
      expect(result).toContain('unclosed bold');
    });

    it('should handle empty table cells correctly', async () => {
      const markdown = `| | Empty Header | |
| --- | --- | --- |
| | Content | |`;

      const result = await converter.convert(markdown);
      expect(result).toContain('<th></th>');
      expect(result).toContain('<th>Empty Header</th>');
      expect(result).toContain('<td></td>');
      expect(result).toContain('<td>Content</td>');
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain content fidelity', async () => {
      const markdown = `# Header

Paragraph with **bold** and *italic*.

- List item 1
- List item 2

\`\`\`python
def hello():
    print("world")
\`\`\`

| Column | Data |
| --- | --- |
| Row 1 | Value 1 |

> [!NOTE]
> Important note`;

      const confluenceHtml = await converter.convert(markdown);

      // Verify key elements are preserved
      expect(confluenceHtml).toContain('Header');
      expect(confluenceHtml).toContain('bold');
      expect(confluenceHtml).toContain('italic');
      expect(confluenceHtml).toContain('List item 1');
      expect(confluenceHtml).toContain('python');
      expect(confluenceHtml).toContain('print("world")');
      expect(confluenceHtml).toContain('Column');
      expect(confluenceHtml).toContain('Value 1');
      expect(confluenceHtml).toContain('note');
      expect(confluenceHtml).toContain('Important note');
    });
  });
});
