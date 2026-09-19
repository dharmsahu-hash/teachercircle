// Node's native TypeScript support strips types syntactically but does not
// add TypeScript-style extensionless module resolution — a plain `node --test`
// run can't resolve `import { pg } from "./db"` the way Next.js's own bundler
// does. Rather than add explicit .ts extensions to production imports (which
// tsconfig.json disallows by default and Next.js doesn't need), this hook
// teaches Node's resolver the one trick it's missing: if a relative,
// extensionless specifier doesn't resolve, retry with .ts / .tsx appended.
// Registered via tests/register-ts-resolver.mjs.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !/\.[a-zA-Z]+$/.test(specifier)) {
    for (const ext of [".ts", ".tsx"]) {
      try {
        return await nextResolve(specifier + ext, context);
      } catch {
        // try the next extension
      }
    }
  }
  return nextResolve(specifier, context);
}
