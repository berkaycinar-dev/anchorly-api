import { z } from "zod";
import { displayNameSchema, passwordSchema } from "./auth.js";

export const updateMeSchema = z.strictObject({
  displayName: displayNameSchema.nullable(),
});

export const deleteAccountSchema = z.strictObject({
  password: z.string().min(1).max(128),
});

export const changePasswordSchema = z.strictObject({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
});
