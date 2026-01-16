/**
 * Parsed section from markdown
 */
export interface ParsedSection {
  heading: string;
  level: number;
  content: string[];
  items: Map<string, string>;
}

/**
 * Parse markdown content into sections
 */
export function parseMarkdown(content: string): ParsedSection[] {
  const lines = content.split('\n');
  const sections: ParsedSection[] = [];
  let currentSection: ParsedSection | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        sections.push(currentSection);
      }
      // Start new section
      currentSection = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        content: [],
        items: new Map(),
      };
    } else if (currentSection) {
      const trimmed = line.trim();
      if (trimmed) {
        currentSection.content.push(trimmed);

        // Parse list items with key-value format: "- Key: value"
        const itemMatch = trimmed.match(/^-\s+(.+?):\s*(.+)$/);
        if (itemMatch) {
          const key = itemMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
          const value = itemMatch[2].trim();
          currentSection.items.set(key, value);
        }
      }
    }
  }

  // Save last section
  if (currentSection) {
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Find a section by heading (case-insensitive)
 */
export function findSection(
  sections: ParsedSection[],
  heading: string
): ParsedSection | undefined {
  const lowerHeading = heading.toLowerCase();
  return sections.find((s) => s.heading.toLowerCase() === lowerHeading);
}

/**
 * Parse a numeric value, handling units
 */
export function parseNumericValue(value: string): number {
  // Remove common units and parse
  const cleaned = value
    .replace(/\s*(inches|inch|in|in\/s|in\/s\^2|degrees|deg|\/s|%|seconds|s)$/i, '')
    .trim();
  return parseFloat(cleaned);
}

/**
 * Parse a boolean value from various formats
 */
export function parseBooleanValue(value: string): boolean {
  const lower = value.toLowerCase().trim();
  return ['yes', 'true', '1', 'enabled', 'on'].includes(lower);
}

/**
 * Get a required value from a section's items
 */
export function getRequiredValue(
  section: ParsedSection,
  key: string
): string {
  const value = section.items.get(key.toLowerCase().replace(/\s+/g, '_'));
  if (value === undefined) {
    throw new Error(`Missing required field '${key}' in section '${section.heading}'`);
  }
  return value;
}

/**
 * Get an optional value from a section's items with default
 */
export function getOptionalValue(
  section: ParsedSection,
  key: string,
  defaultValue: string
): string {
  return section.items.get(key.toLowerCase().replace(/\s+/g, '_')) ?? defaultValue;
}
