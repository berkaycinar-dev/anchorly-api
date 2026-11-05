import { DEFAULT_SETTINGS } from "../constants/settings.js";

const COPY = {
  tr: {
    greeting: (name) => (name ? `Merhaba ${name},` : "Merhaba,"),
    signature: "Anchorly",
    verifyEmail: {
      subject: "Anchorly: e-posta adresini doğrula",
      intro:
        "Anchorly hesabını oluşturduğun için teşekkürler. E-posta adresini doğrulamak için bağlantıyı aç:",
      action: "E-postamı doğrula",
      expiry: (hours) =>
        `Bağlantı ${hours} saat geçerli ve yalnızca bir kez kullanılabilir.`,
      ignore:
        "Bu hesabı sen oluşturmadıysan bu e-postayı görmezden gelebilirsin.",
    },
    resetPassword: {
      subject: "Anchorly: parolanı sıfırla",
      intro:
        "Anchorly parolanı sıfırlamak için bir istek aldık. Yeni bir parola belirlemek için bağlantıyı aç:",
      action: "Parolamı sıfırla",
      expiry: (hours) =>
        `Bağlantı ${hours} saat geçerli ve yalnızca bir kez kullanılabilir. Parolan değişince bütün cihazlarda oturumun kapanır.`,
      ignore:
        "Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin; parolan değişmez.",
    },
  },
  en: {
    greeting: (name) => (name ? `Hi ${name},` : "Hi,"),
    signature: "Anchorly",
    verifyEmail: {
      subject: "Anchorly: verify your email address",
      intro:
        "Thanks for creating your Anchorly account. Open the link to verify your email address:",
      action: "Verify my email",
      expiry: (hours) =>
        `The link works for ${hours} hours and can be used only once.`,
      ignore: "If you did not create this account, you can ignore this email.",
    },
    resetPassword: {
      subject: "Anchorly: reset your password",
      intro:
        "We received a request to reset your Anchorly password. Open the link to choose a new one:",
      action: "Reset my password",
      expiry: (hours) =>
        `The link works for ${hours} hours and can be used only once. Changing your password signs you out on every device.`,
      ignore:
        "If you did not ask for this, you can ignore this email; your password stays the same.",
    },
  },
};

const PAGES = {
  verifyEmail: "/verify-email",
  resetPassword: "/reset-password",
};

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildActionLink(appUrl, kind, token) {
  const url = new URL(`${appUrl.replace(/\/+$/, "")}${PAGES[kind]}`);

  url.hash = new URLSearchParams({ token }).toString();
  return url.toString();
}

function buildMessage(
  kind,
  { to, displayName, language, appUrl, token, validForHours },
) {
  const copy = COPY[language] ?? COPY[DEFAULT_SETTINGS.language];
  const text = copy[kind];
  const link = buildActionLink(appUrl, kind, token);
  const greeting = copy.greeting(displayName);

  return {
    to,
    subject: text.subject,
    text: [
      greeting,
      "",
      text.intro,
      link,
      "",
      text.expiry(validForHours),
      text.ignore,
      "",
      copy.signature,
    ].join("\n"),
    html: [
      `<p>${escapeHtml(greeting)}</p>`,
      `<p>${escapeHtml(text.intro)}</p>`,
      `<p><a href="${escapeHtml(link)}">${escapeHtml(text.action)}</a></p>`,
      `<p>${escapeHtml(text.expiry(validForHours))}<br>${escapeHtml(text.ignore)}</p>`,
      `<p>${escapeHtml(copy.signature)}</p>`,
    ].join("\n"),
  };
}

export function verifyEmailMessage(options) {
  return buildMessage("verifyEmail", options);
}

export function resetPasswordMessage(options) {
  return buildMessage("resetPassword", options);
}
