import type { paths } from './index';
import createFetchClient from 'openapi-fetch';

export function getApiClient(headers?: Headers) {
  const client = createFetchClient<paths>({
    baseUrl: 'http://localhost:8787',
    headers,
  });

  return client;
}
