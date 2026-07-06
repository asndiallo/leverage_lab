/** Builds a FormData the way a real <form> would submit it — every value
 * stringified, booleans as the checkbox convention ("on" / omitted), File
 * values passed through as-is. */
export function buildFormData(fields: Record<string, string | number | boolean | File | undefined>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (typeof value === "boolean") {
      if (value) fd.set(key, "on");
      continue;
    }
    if (value instanceof File) {
      fd.set(key, value);
      continue;
    }
    fd.set(key, String(value));
  }
  return fd;
}
