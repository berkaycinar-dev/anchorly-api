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
    changeEmail: {
      subject: "Anchorly: yeni e-posta adresini onayla",
      intro:
        "Anchorly hesabının e-posta adresini bu adresle değiştirmek için bir istek aldık. Onaylamak için bağlantıyı aç:",
      action: "Yeni adresimi onayla",
      expiry: (hours) =>
        `Bağlantı ${hours} saat geçerli ve yalnızca bir kez kullanılabilir.`,
      ignore:
        "Bu isteği sen yapmadıysan bu e-postayı görmezden gelebilirsin; adres değişmez.",
    },
    emailChanged: {
      subject: "Anchorly: e-posta adresin değişti",
      body: (newEmail) =>
        `Anchorly hesabının e-posta adresi ${newEmail} olarak değiştirildi. Bundan sonra girişte bu adresi kullanacaksın.`,
      warning:
        "Bu değişikliği sen yapmadıysan hesabına başkası girmiş olabilir; hemen bizimle iletişime geç.",
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
    changeEmail: {
      subject: "Anchorly: confirm your new email address",
      intro:
        "We received a request to change your Anchorly email address to this one. Open the link to confirm it:",
      action: "Confirm my new email",
      expiry: (hours) =>
        `The link works for ${hours} hours and can be used only once.`,
      ignore:
        "If you did not ask for this, you can ignore this email; the address stays the same.",
    },
    emailChanged: {
      subject: "Anchorly: your email address was changed",
      body: (newEmail) =>
        `The email address of your Anchorly account was changed to ${newEmail}. From now on, sign in with that address.`,
      warning:
        "If you did not make this change, someone else may have signed in to your account; contact us right away.",
    },
  },
};

const PAGES = {
  verifyEmail: "/verify-email",
  resetPassword: "/reset-password",
  changeEmail: "/confirm-email",
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
  const copy = pickCopy(language);
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

function pickCopy(language) {
  return COPY[language] ?? COPY[DEFAULT_SETTINGS.language];
}

export function verifyEmailMessage(options) {
  return buildMessage("verifyEmail", options);
}

export function resetPasswordMessage(options) {
  return buildMessage("resetPassword", options);
}

export function changeEmailMessage(options) {
  return buildMessage("changeEmail", options);
}

export function emailChangedMessage({ to, displayName, language, newEmail }) {
  const copy = pickCopy(language);
  const text = copy.emailChanged;
  const greeting = copy.greeting(displayName);
  const body = text.body(newEmail);

  return {
    to,
    subject: text.subject,
    text: [greeting, "", body, "", text.warning, "", copy.signature].join("\n"),
    html: [
      `<p>${escapeHtml(greeting)}</p>`,
      `<p>${escapeHtml(body)}</p>`,
      `<p>${escapeHtml(text.warning)}</p>`,
      `<p>${escapeHtml(copy.signature)}</p>`,
    ].join("\n"),
  };
}
