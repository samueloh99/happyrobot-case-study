import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  BACKEND_API_KEY: z.string().min(16),

  TMS_HOST: z.string().min(1),
  TMS_PORT: z.coerce.number().int().positive(),
  TMS_TOKEN: z.string().min(1),
  TMS_CLIENT_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),

  FMCSA_WEB_KEY: z.string().min(1),
  FMCSA_BASE_URL: z.string().url().default('https://mobile.fmcsa.dot.gov/qc/services'),

  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM: z.string().default('noreply@example.com'),

  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(3),

  NEGOTIATION_MAX_ROUNDS: z.coerce.number().int().positive().default(3),
  NEGOTIATION_SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(1800),
});

export type Env = z.infer<typeof envSchema>;

export const loadEnv = (): Env => {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${errors}`);
  }
  return parsed.data;
};
