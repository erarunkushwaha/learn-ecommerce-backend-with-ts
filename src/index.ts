import { pathToFileURL } from "node:url";

/** Toolchain entry for F01. HTTP composition starts in a later task. */
export const serviceName = "ecom-backend";

export function bootstrapMessage(): string {
  return `${serviceName}: TypeScript bootstrap ready`;
}

const invokedPath = process.argv[1];

if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  console.log(bootstrapMessage());
}
