import { z } from "zod";
import { displayNameSchema, emailSchema, passwordSchema } from "./auth.js";

export const updateMeSchema = z.strictObject({
  displayName: displayNameSchema.nullable(),
});

export const sessionIdParams = z.object({ id: z.uuid() });

export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});

export const changeEmailSchema = z.strictObject({
  newEmail: emailSchema,
  password: z.string().min(1).max(128),
});

export const acceptTermsSchema = z.strictObject({
  accept: z
    .literal(true)
    .describe("Must be true: the user accepts the current terms of use"),
});
