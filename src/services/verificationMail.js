import { VERIFY_EMAIL_TTL_HOURS } from "../constants/emailTokens.js";
import { verifyEmailMessage } from "../mail/messages.js";

export function sendVerificationEmail({
  mailer,
  appUrl,
  user,
  language,
  token,
}) {
  return mailer.send(
    verifyEmailMessage({
      to: user.email,
      displayName: user.displayName,
      language,
      appUrl,
      token,
      validForHours: VERIFY_EMAIL_TTL_HOURS,
    }),
  );
}
