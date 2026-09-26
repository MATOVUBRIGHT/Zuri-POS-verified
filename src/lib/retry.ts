export type RetryOptions = {
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  shouldRetry?: (err: any) => boolean;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const retries = options.retries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 800;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const jitter = options.jitter ?? true;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const shouldRetry = options.shouldRetry ? options.shouldRetry(err) : true;
      if (!shouldRetry || attempt >= retries) throw err;

      const rawDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
      const delay = jitter ? Math.round(rawDelay * (0.7 + Math.random() * 0.6)) : rawDelay;
      await sleep(delay);
    }
  }

  // unreachable
  throw new Error("retryWithBackoff: exhausted");
}

