const RESEND_ENDPOINT = "https://api.resend.com/emails";

async function readErrorDetail(response) {
  try {
    const body = await response.json();

    return typeof body?.message === "string" ? body.message : null;
  } catch {
    return null;
  }
}

export function createConsoleMailer({ logger = console } = {}) {
  return {
    async send({ to, subject, text }) {
      logger.info(
        [
          "",
          "──────── outgoing email ────────",
          `To:      ${to}`,
          `Subject: ${subject}`,
          "",
          text,
          "────────────────────────────────",
          "",
        ].join("\n"),
      );
    },
  };
}

export function createResendMailer({ apiKey, from, fetch = globalThis.fetch }) {
  return {
    async send({ to, subject, text, html }) {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from, to: [to], subject, text, html }),
      });

      if (!response.ok) {
        const detail = await readErrorDetail(response);
        const suffix = detail ? `: ${detail}` : "";

        throw new Error(
          `Resend rejected the email with status ${response.status}${suffix}`,
        );
      }
    },
  };
}

export function createMailer(mail, { logger, fetch } = {}) {
  if (mail.provider === "resend") {
    return createResendMailer({
      apiKey: mail.resendApiKey,
      from: mail.from,
      fetch,
    });
  }

  return createConsoleMailer({ logger });
}
