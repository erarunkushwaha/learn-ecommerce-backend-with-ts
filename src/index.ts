import { pathToFileURL } from "node:url";

/** Toolchain module from F01. The HTTP process entry is src/server.ts. */
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
