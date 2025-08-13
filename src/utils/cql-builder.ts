export class CQLBuilder {
  private conditions: string[] = [];

  public addTextSearch(text: string): this {
    if (text) {
      // Escape quotes in search text to prevent CQL injection
      const escapedText = this.sanitizeCQLValue(text);
      this.conditions.push(`text ~ "${escapedText}"`);
    }
    return this;
  }

  private sanitizeCQLValue(value: string): string {
    // Escape special characters to prevent CQL injection
    return value
      .replace(/\\/g, '\\\\') // Escape backslashes first
      .replace(/"/g, '\\"') // Escape quotes
      .replace(/\n/g, '\\n') // Escape newlines
      .replace(/\r/g, '\\r'); // Escape carriage returns
  }

  public addAuthorFilter(author: string): this {
    if (author) {
      const sanitizedAuthor = this.sanitizeCQLValue(author);
      this.conditions.push(`creator = "${sanitizedAuthor}"`);
    }
    return this;
  }

  public addDateFilter(field: string, operator: '>' | '<' | '>=' | '<=' | '=', date: string): this {
    if (date) {
      // Ensure date is in correct format (YYYY-MM-DD)
      const formattedDate = this.formatDate(date);
      this.conditions.push(`${field} ${operator} "${formattedDate}"`);
    }
    return this;
  }

  public addLabelFilter(labels: string[]): this {
    if (labels && labels.length > 0) {
      const labelConditions = labels.map(label => `label = "${this.sanitizeCQLValue(label)}"`);
      if (labelConditions.length === 1) {
        this.conditions.push(labelConditions[0]!);
      }
      else {
        this.conditions.push(`(${labelConditions.join(' OR ')})`);
      }
    }
    return this;
  }

  public addSpaceFilter(spaces: string[]): this {
    if (spaces && spaces.length > 0) {
      const spaceConditions = spaces.map(space => `space = "${this.sanitizeCQLValue(space)}"`);
      if (spaceConditions.length === 1) {
        this.conditions.push(spaceConditions[0]!);
      }
      else {
        this.conditions.push(`(${spaceConditions.join(' OR ')})`);
      }
    }
    return this;
  }

  public addTypeFilter(type: 'page' | 'blogpost'): this {
    this.conditions.push(`type = "${type}"`);
    return this;
  }

  public addCustomCondition(condition: string): this {
    if (condition) {
      this.conditions.push(condition);
    }
    return this;
  }

  public build(): string {
    if (this.conditions.length === 0) {
      // Default to all pages if no conditions
      return 'type = "page"';
    }
    return this.conditions.join(' AND ');
  }

  public reset(): this {
    this.conditions = [];
    return this;
  }

  private formatDate(date: string): string {
    // Parse ISO 8601 date and format as YYYY-MM-DD for CQL
    const dateObj = new Date(date);
    if (Number.isNaN(dateObj.getTime())) {
      throw new TypeError(`Invalid date format: ${date}`);
    }

    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  // Static helper methods for common queries
  public static recentlyModified(days = 7): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return new CQLBuilder()
      .addDateFilter('lastmodified', '>', date.toISOString())
      .build();
  }

  public static byAuthor(author: string): string {
    return new CQLBuilder()
      .addAuthorFilter(author)
      .build();
  }

  public static inSpace(space: string): string {
    return new CQLBuilder()
      .addSpaceFilter([space])
      .build();
  }

  public static withLabel(label: string): string {
    return new CQLBuilder()
      .addLabelFilter([label])
      .build();
  }
}
