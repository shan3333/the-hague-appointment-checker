export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  retries: number,
  backoffMs: number,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  onRetry: (error: unknown, nextAttempt: number) => void = () => {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) {
      lastError = error;
      if (attempt > retries) break;
      onRetry(error, attempt + 1);
      await sleep(backoffMs * attempt);
    }
  }
  throw lastError;
}
