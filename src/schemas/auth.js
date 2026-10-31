import { z } from "zod";

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .check(z.email());

export const passwordSchema = z.string().min(8).max(128);

export const displayNameSchema = z.string().trim().min(1).max(100);

export const registerSchema = z.strictObject({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema.optional(),
});
