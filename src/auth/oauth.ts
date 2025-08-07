import { exec } from 'node:child_process';
import { createServer } from 'node:http';
import process from 'node:process';
import { URL } from 'node:url';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  tokenType: string;
}

export class OAuthHandler {
  private config: OAuthConfig;
  private readonly authUrl = 'https://auth.atlassian.com/authorize';
  private readonly tokenUrl = 'https://auth.atlassian.com/oauth/token';

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  public async authorize(): Promise<OAuthToken> {
    const authorizationUrl = this.buildAuthorizationUrl();

    await this.openBrowser(authorizationUrl);

    const authCode = await this.waitForCallback();

    return await this.exchangeCodeForToken(authCode);
  }

  public async refreshToken(refreshToken: string): Promise<OAuthToken> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`CS-401: Failed to refresh OAuth token: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  private buildAuthorizationUrl(): string {
    const params = new URLSearchParams({
      audience: 'api.atlassian.com',
      client_id: this.config.clientId,
      scope: this.config.scopes.join(' '),
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      prompt: 'consent',
    });

    return `${this.authUrl}?${params.toString()}`;
  }

  private async waitForCallback(): Promise<string> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = new URL(req.url || '', `http://localhost`);

        if (url.pathname === '/callback') {
          const code = url.searchParams.get('code');
          const error = url.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Failed</h1><p>Please try again.</p>');
            server.close();
            reject(new Error(`CS-401: OAuth authorization failed: ${error}`));
          }
          else if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end('<h1>Authentication Successful!</h1><p>You can close this window.</p>');
            server.close();
            resolve(code);
          }
        }
      });

      const port = new URL(this.config.redirectUri).port || '8080';
      server.listen(Number.parseInt(port, 10), () => {
        // Silent listener, no logging needed
      });

      setTimeout(() => {
        server.close();
        reject(new Error('CS-408: OAuth authorization timeout'));
      }, 120000);
    });
  }

  private async exchangeCodeForToken(code: string): Promise<OAuthToken> {
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`CS-401: Failed to exchange authorization code for token: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
      tokenType: data.token_type,
    };
  }

  private async openBrowser(url: string): Promise<void> {
    const platform = process.platform;
    let command: string;

    if (platform === 'darwin') {
      command = `open "${url}"`;
    }
    else if (platform === 'win32') {
      command = `start "${url}"`;
    }
    else {
      command = `xdg-open "${url}"`;
    }

    try {
      await execAsync(command);
    }
    catch {
      // Failed to open browser, user will need to open manually
    }
  }
}
