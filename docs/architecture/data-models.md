# Data Models

## Page

**Purpose:** Represents a Confluence page with its content, metadata, and sync state

**Key Attributes:**
- `id`: string - Unique Confluence page ID
- `spaceKey`: string - Confluence space identifier
- `title`: string - Page title
- `version`: number - Confluence version number
- `parentId`: string | null - Parent page ID for hierarchy
- `lastModified`: Date - Confluence last modification timestamp
- `localPath`: string - Relative path to local Markdown file
- `contentHash`: string - SHA-256 hash of content for change detection
- `status`: 'synced' | 'modified' | 'conflicted' - Current sync status

**Relationships:**
- Has one parent Page (optional, for hierarchy)
- Has many child Pages (for hierarchy)
- Belongs to one Space

## SyncManifest

**Purpose:** Tracks the overall sync state and configuration for a workspace

**Key Attributes:**
- `version`: string - Manifest schema version for migrations
- `confluenceUrl`: string - Base URL of Confluence instance
- `lastSyncTime`: Date - Timestamp of last successful sync
- `syncMode`: 'manual' | 'watch' - Current operation mode
- `pages`: Map<string, Page> - Indexed collection of tracked pages
- `config`: SyncConfig - User preferences and settings

**Relationships:**
- Contains many Pages
- References one ConfluenceInstance
- Has one SyncConfig

## SyncConfig

**Purpose:** User-configurable settings for sync behavior

**Key Attributes:**
- `profile`: string - Active configuration profile name
- `includePatterns`: string[] - Glob patterns for files to include
- `excludePatterns`: string[] - Glob patterns for files to exclude
- `concurrentOperations`: number - Max parallel API calls (default: 5)
- `conflictStrategy`: 'manual' | 'local-first' | 'remote-first'
- `formatOptions`: FormatConfig - Markdown conversion preferences
- `cacheEnabled`: boolean - Whether to use local caching

**Relationships:**
- Belongs to one SyncManifest
- Configures many SyncOperations

## SyncOperation

**Purpose:** Represents an atomic sync operation for audit and rollback

**Key Attributes:**
- `id`: string - Unique operation identifier (UUID)
- `type`: 'pull' | 'push' | 'sync' - Operation type
- `pageIds`: string[] - Pages involved in operation
- `startTime`: Date - Operation start timestamp
- `endTime`: Date | null - Operation completion timestamp
- `status`: 'pending' | 'in-progress' | 'completed' | 'failed'
- `changes`: ChangeSet[] - List of changes in this operation
- `error`: Error | null - Error details if failed

**Relationships:**
- Affects many Pages
- Contains many ChangeSets
- Created by one User action

## ChangeSet

**Purpose:** Tracks individual changes within a sync operation for granular rollback

**Key Attributes:**
- `pageId`: string - Affected page ID
- `changeType`: 'create' | 'update' | 'delete'
- `direction`: 'local-to-remote' | 'remote-to-local'
- `previousVersion`: number - Version before change
- `newVersion`: number - Version after change
- `previousHash`: string - Content hash before change
- `backup`: string | null - Path to backup file if created

**Relationships:**
- Belongs to one SyncOperation
- Modifies one Page
