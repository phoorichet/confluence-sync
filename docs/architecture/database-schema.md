# Database Schema

## Primary Storage: JSON Manifest Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "version": {
      "type": "string",
      "description": "Manifest schema version",
      "pattern": "^\\d+\\.\\d+\\.\\d+$"
    },
    "confluenceUrl": {
      "type": "string",
      "format": "uri"
    },
    "lastSyncTime": {
      "type": "string",
      "format": "date-time"
    },
    "syncMode": {
      "type": "string",
      "enum": ["manual", "watch"]
    },
    "pages": {
      "type": "object",
      "additionalProperties": {
        "$ref": "#/definitions/Page"
      }
    },
    "config": {
      "$ref": "#/definitions/SyncConfig"
    }
  },
  "required": ["version", "confluenceUrl", "pages"],
  "definitions": {
    "Page": {
      "type": "object",
      "properties": {
        "id": { "type": "string" },
        "spaceKey": { "type": "string" },
        "title": { "type": "string" },
        "version": { "type": "number" },
        "parentId": { "type": ["string", "null"] },
        "lastModified": { "type": "string", "format": "date-time" },
        "localPath": { "type": "string" },
        "contentHash": { "type": "string" },
        "status": {
          "type": "string",
          "enum": ["synced", "modified", "conflicted"]
        }
      },
      "required": ["id", "spaceKey", "title", "version", "localPath", "contentHash", "status"]
    },
    "SyncConfig": {
      "type": "object",
      "properties": {
        "profile": { "type": "string" },
        "includePatterns": {
          "type": "array",
          "items": { "type": "string" }
        },
        "excludePatterns": {
          "type": "array",
          "items": { "type": "string" }
        },
        "concurrentOperations": {
          "type": "number",
          "minimum": 1,
          "maximum": 10,
          "default": 5
        },
        "conflictStrategy": {
          "type": "string",
          "enum": ["manual", "local-first", "remote-first"]
        }
      }
    }
  }
}
```

## Configuration File Schema (.confluence-sync.yml)

```yaml