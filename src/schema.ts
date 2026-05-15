import { z } from 'zod';
import { Messages } from './errors.js';

const ONE_MB = 1024 * 1024;

export const EmailSendInputSchema = z.object({
  projectId: z
    .number({ error: Messages.validation.projectIdRequired() })
    .int(Messages.validation.projectIdNotPositive())
    .positive(Messages.validation.projectIdNotPositive()),
  to: z
    .string({ error: Messages.validation.toRequired() })
    .min(1, Messages.validation.toRequired())
    .email(Messages.validation.toInvalid())
    .max(510, Messages.validation.toTooLong()),
  subject: z
    .string({ error: Messages.validation.subjectRequired() })
    .min(1, Messages.validation.subjectRequired())
    .max(510, Messages.validation.subjectTooLong()),
  message: z
    .string({ error: Messages.validation.messageRequired() })
    .min(1, Messages.validation.messageRequired())
    .max(ONE_MB, Messages.validation.messageTooLarge()),
});

export type EmailSendInput = z.infer<typeof EmailSendInputSchema>;
