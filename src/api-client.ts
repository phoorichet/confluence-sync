import type { paths } from './index';
import createFetchClient from 'openapi-fetch';
import { AuthManager } from './auth/auth-manager';

export async function getApiClient(headers?: Headers) {
  const authManager = AuthManager.getInstance();

  let baseUrl = 'http://localhost:8787';
  const authHeaders: Record<string, string> = {};

  try {
    const credentials = await authManager.getStoredCredentials();
    if (credentials && credentials.url) {
      baseUrl = credentials.url;
    }

    const token = await authManager.getToken();
    authHeaders.Authorization = token;
  }
  catch {
    // No auth configured, continue without auth headers
  }

  const client = createFetchClient<paths>({
    baseUrl,
    headers: {
      ...authHeaders,
      ...Object.fromEntries(headers?.entries() || []),
    },
  });

  return client;
}
