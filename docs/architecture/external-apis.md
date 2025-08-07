# External APIs

## Confluence REST API

- **Purpose:** Primary interface for all Confluence page operations including reading, writing, and metadata management
- **Documentation:**
  - Cloud: https://developer.atlassian.com/cloud/confluence/rest/v2/
  - Server/Data Center: https://docs.atlassian.com/atlassian-confluence/REST/latest/
- **Base URL(s):**
  - Cloud: `https://{your-domain}.atlassian.net/wiki/api/v2`
  - Server: `https://{your-server}/rest/api`
- **Authentication:**
  - Cloud: OAuth 2.0 or API Token with Basic Auth
  - Server: Personal Access Token or Basic Auth
- **Rate Limits:**
  - Cloud: 5000 requests per hour per user
  - Server: No hard limit (instance-dependent)

**Key Endpoints Used:**
- `GET /pages/{id}` - Retrieve page content and metadata
- `PUT /pages/{id}` - Update existing page content
- `GET /pages/{id}/versions` - Get page version history
- `GET /spaces/{key}/pages` - List pages in a space
- `GET /pages/{id}/children` - Get child pages for hierarchy
- `POST /search/cql` - Search pages using CQL
- `GET /users/current` - Validate authentication

**Integration Notes:**
- Must handle both storage format (XHTML) and view format (HTML)
- Version number must be incremented on updates to prevent conflicts
- Use `expand` parameter to reduce API calls (e.g., `?expand=body.storage,version,ancestors`)
- Implement exponential backoff for rate limit handling
- Cache frequently accessed metadata to minimize API calls
