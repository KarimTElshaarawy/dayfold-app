import { getDevice } from '../device';
import { ApiError } from './errors';

export { ApiError };

/** Same call shape as the web app's network client, answered by the on-device router. */
export const api = async <T>(method: string, url: string, body?: unknown): Promise<T> => {
  const reply = await getDevice().router.handle(method, url, body === undefined ? undefined : JSON.parse(JSON.stringify(body)));
  if (reply.status >= 400) throw new ApiError(reply.status, (reply.json as { error?: string } | null)?.error ?? `Request failed (${reply.status})`);
  return reply.json as T;
};
