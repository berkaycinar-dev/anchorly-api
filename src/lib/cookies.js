export function readCookie(header, name) {
  if (typeof header !== "string" || header.length === 0) {
    return null;
  }

  for (const part of header.split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1 || part.slice(0, separator).trim() !== name) {
      continue;
    }

    const value = part.slice(separator + 1).trim();

    try {
      return decodeURIComponent(value) || null;
    } catch {
      return null;
    }
  }

  return null;
}
