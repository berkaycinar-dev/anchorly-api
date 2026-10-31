import { describe, expect, it, vi } from "vitest";
import {
  createConsoleMailer,
  createMailer,
  createResendMailer,
} from "../src/mail/mailers.js";
import {
  buildActionLink,
  resetPasswordMessage,
  verifyEmailMessage,
} from "../src/mail/messages.js";

const email = {
  to: "ali@example.com",
  subject: "Hello",
  text: "Plain text body",
  html: "<p>Plain text body</p>",
};

const messageOptions = {
  to: "ali@example.com",
  displayName: "Ali",
  language: "tr",
  appUrl: "http://localhost:5173",
  token: "abc_DEF-123",
  validForHours: 24,
};

describe("console mailer", () => {
  it("writes the recipient, subject and text to the log", async () => {
    const logger = { info: vi.fn() };

    await createConsoleMailer({ logger }).send(email);

    const output = logger.info.mock.calls[0][0];
    expect(output).toContain("To:      ali@example.com");
    expect(output).toContain("Subject: Hello");
    expect(output).toContain("Plain text body");
  });
});

describe("resend mailer", () => {
  it("posts the email to the Resend API with the key in the header", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    const mailer = createResendMailer({
      apiKey: "re_secret",
      from: "Anchorly <no-reply@anchorly.app>",
      fetch,
    });

    await mailer.send(email);

    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(request.method).toBe("POST");
    expect(request.headers.Authorization).toBe("Bearer re_secret");
    expect(JSON.parse(request.body)).toEqual({
      from: "Anchorly <no-reply@anchorly.app>",
      to: ["ali@example.com"],
      subject: "Hello",
      text: "Plain text body",
      html: "<p>Plain text body</p>",
    });
  });

  it("fails without revealing the API key when Resend refuses", async () => {
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 422 });
    const mailer = createResendMailer({
      apiKey: "re_secret",
      from: "a@b.co",
      fetch,
    });

    const error = await mailer.send(email).catch((caught) => caught);

    expect(error.message).toBe("Resend rejected the email with status 422");
    expect(error.message).not.toContain("re_secret");
  });
});

describe("createMailer", () => {
  it("picks the mailer that the settings ask for", async () => {
    const logger = { info: vi.fn() };
    const fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await createMailer({ provider: "console" }, { logger }).send(email);
    await createMailer(
      { provider: "resend", resendApiKey: "re_secret", from: "a@b.co" },
      { fetch },
    ).send(email);

    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe("email messages", () => {
  it("puts the token after # so it never reaches a server", () => {
    const link = buildActionLink(
      "http://localhost:5173",
      "verifyEmail",
      "abc_DEF-123",
    );

    expect(link).toBe("http://localhost:5173/verify-email#token=abc_DEF-123");
    expect(new URL(link).search).toBe("");
  });

  it("keeps a base path and drops a trailing slash in the app url", () => {
    expect(
      buildActionLink("https://example.com/app/", "resetPassword", "t"),
    ).toBe("https://example.com/app/reset-password#token=t");
  });

  it("writes the verification email in Turkish", () => {
    const message = verifyEmailMessage(messageOptions);

    expect(message.to).toBe("ali@example.com");
    expect(message.subject).toBe("Anchorly: e-posta adresini doğrula");
    expect(message.text).toContain("Merhaba Ali,");
    expect(message.text).toContain(
      "http://localhost:5173/verify-email#token=abc_DEF-123",
    );
    expect(message.text).toContain("24 saat");
    expect(message.html).toContain(
      'href="http://localhost:5173/verify-email#token=abc_DEF-123"',
    );
  });

  it("writes the password reset email in English", () => {
    const message = resetPasswordMessage({
      ...messageOptions,
      language: "en",
      displayName: null,
      validForHours: 1,
    });

    expect(message.subject).toBe("Anchorly: reset your password");
    expect(message.text.startsWith("Hi,\n")).toBe(true);
    expect(message.text).toContain("/reset-password#token=abc_DEF-123");
    expect(message.text).toContain("1 hours");
  });

  it("falls back to Turkish for an unknown language", () => {
    expect(
      verifyEmailMessage({ ...messageOptions, language: "de" }).subject,
    ).toBe("Anchorly: e-posta adresini doğrula");
  });

  it("escapes the display name in the html version", () => {
    const message = verifyEmailMessage({
      ...messageOptions,
      displayName: '<img src=x onerror="alert(1)">',
    });

    expect(message.html).not.toContain("<img");
    expect(message.html).toContain(
      "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;",
    );
  });
});
