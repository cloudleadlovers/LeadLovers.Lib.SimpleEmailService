export type EmailErrorCode =
  | 'validation_error'
  | 'rate_limited'
  | 'persistence_error'
  | 'cache_error';

export interface EmailSendSuccess {
  success: true;
  id: bigint;
  queuedAt: Date;
  deduplicated: boolean;
}

export interface EmailSendFailure {
  success: false;
  code: EmailErrorCode;
  error: string;
  retryAfterMs?: number;
}

export type EmailSendResult = EmailSendSuccess | EmailSendFailure;
