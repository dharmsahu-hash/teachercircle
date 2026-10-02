// URL slugs ("Class 10 Maths" -> "class-10-maths"). Separate from
// lib/directory.ts so pure helpers can use it without database imports.
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
