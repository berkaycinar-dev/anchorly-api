import {
  RESET_PASSWORD_TTL_HOURS,
  VERIFY_EMAIL_TTL_HOURS,
} from "../constants/emailTokens.js";
import { resetPasswordMessage, verifyEmailMessage } from "../mail/messages.js";

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

export function sendPasswordResetEmail({
  mailer,
  appUrl,
  user,
  language,
  token,
}) {
  return mailer.send(
    resetPasswordMessage({
      to: user.email,
      displayName: user.displayName,
      language,
      appUrl,
      token,
      validForHours: RESET_PASSWORD_TTL_HOURS,
    }),
  );
}
