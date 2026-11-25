import { z } from "zod";
import {
  currentPasswordSchema,
  displayNameSchema,
  emailSchema,
  passwordSchema,
} from "./auth.js";

export const updateMeSchema = z.strictObject({
  displayName: displayNameSchema.nullable(),
});

export const sessionIdParams = z.object({ id: z.uuid() });

export const deleteAccountSchema = z.strictObject({
  password: currentPasswordSchema,
});

export const changePasswordSchema = z.strictObject({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});

export const changeEmailSchema = z.strictObject({
  newEmail: emailSchema,
  password: currentPasswordSchema,
});

export const acceptTermsSchema = z.strictObject({
  accept: z
    .literal(true)
    .describe("Must be true: the user accepts the current terms of use"),
});
