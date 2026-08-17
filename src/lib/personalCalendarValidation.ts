export function isValidWebcalUrl(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  try {
    const u = new URL(v);
    return ["webcal:", "http:", "https:"].includes(u.protocol) && !!u.host;
  } catch {
    return false;
  }
}
