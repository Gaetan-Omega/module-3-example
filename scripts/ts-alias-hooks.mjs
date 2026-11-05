import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(root, specifier.slice(2));
    for (const file of [base, `${base}.ts`, `${base}.json`]) {
      if (existsSync(file) && statSync(file).isFile()) {
        return nextResolve(pathToFileURL(file).href, context);
      }
    }
  }
  return nextResolve(specifier, context);
}

// The app imports JSON the way bundlers allow; plain Node wants it declared.
export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    return nextLoad(url, {
      ...context,
      importAttributes: { ...context.importAttributes, type: "json" },
    });
  }
  return nextLoad(url, context);
}
