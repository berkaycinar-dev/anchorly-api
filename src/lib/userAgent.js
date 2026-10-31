const BROWSERS = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bCriOS\/|\bChrome\//, "Chrome"],
  [/\bVersion\/[\d.]+.*\bSafari\//, "Safari"],
];

const SYSTEMS = [
  [/\bWindows NT\b/, "Windows"],
  [/\b(?:iPhone|iPad|iPod)\b/, "iOS"],
  [/\bAndroid\b/, "Android"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bLinux\b/, "Linux"],
];

function findLabel(rules, userAgent) {
  return rules.find(([pattern]) => pattern.test(userAgent))?.[1];
}

export function describeUserAgent(userAgent) {
  if (typeof userAgent !== "string" || userAgent.length === 0) {
    return null;
  }

  const browser = findLabel(BROWSERS, userAgent);
  const system = findLabel(SYSTEMS, userAgent);

  if (!browser || !system) {
    return null;
  }

  return `${browser} · ${system}`;
}
