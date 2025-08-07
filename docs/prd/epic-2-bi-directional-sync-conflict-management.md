# Epic 2: Bi-directional Sync & Conflict Management

Build intelligent synchronization capabilities that detect changes on both local and remote sides, handle conflicts gracefully, and provide reliable format conversion between Markdown and Confluence storage format. This makes the tool production-ready for real-world documentation workflows.

## Story 2.1: Enhanced Manifest & Change Detection

As a developer,
I want the system to track file states and detect changes,
so that sync operations can be intelligent and efficient.

### Acceptance Criteria

1: Manifest schema enhanced with file hashes, timestamps, and sync states
2: Local file change detection using content hashing (MD5 or SHA-256)
3: Remote change detection via Confluence version API comparison
4: Three-way state tracking: local changes, remote changes, or both changed
5: `confluence-sync status` command shows changed files and their states
6: Manifest supports multiple pages with hierarchical structure
7: Automatic manifest migration from v1 to v2 format

## Story 2.2: Advanced Format Conversion

As a user,
I want comprehensive format conversion between Markdown and Confluence,
so that my content maintains fidelity across systems.

### Acceptance Criteria

1: Table conversion with proper column alignment and headers
2: Nested list support (ordered, unordered, mixed)
3: Image reference preservation with relative paths
4: Code block language hints maintained
5: Confluence info/warning/note panels mapped to Markdown equivalents
6: Link conversion handling both internal and external links
7: Format conversion test suite with 20+ test cases covering edge cases

## Story 2.3: Conflict Detection & Resolution

As a user,
I want clear conflict detection and resolution options,
so that I never lose work during synchronization.

### Acceptance Criteria

1: Automatic conflict detection when both local and remote changed
2: Conflict markers added to files (similar to Git <<<<<<< ======= >>>>>>>)
3: `confluence-sync conflicts` command lists all conflicted files
4: Manual resolution supported with `--force-local` or `--force-remote` flags
5: Backup created before any destructive operation (.backup extension)
6: Diff display showing local vs remote changes
7: Resolution tracking in manifest to prevent re-conflicts

## Story 2.4: Intelligent Sync Command

As a user,
I want a single sync command that handles bi-directional updates,
so that keeping documents synchronized is effortless.

### Acceptance Criteria

1: `confluence-sync sync` detects and syncs all changes in both directions
2: Local-only changes pushed automatically
3: Remote-only changes pulled automatically
4: Conflicts reported with manual resolution required
5: Dry-run mode shows all operations before execution
6: Batch operations with progress bar for multiple files
7: Summary report showing files pulled, pushed, conflicted, and unchanged

## Story 2.5: Page Hierarchy & Space Support

As a user,
I want to sync entire page hierarchies and spaces,
so that I can manage complete documentation sets.

### Acceptance Criteria

1: `confluence-sync pull --space <key>` pulls all pages in a space
2: Page hierarchy preserved in local directory structure
3: Parent-child relationships maintained in manifest
4: `confluence-sync pull --recursive <pageId>` pulls page and all children
5: Bulk push supports directory structures mapping to page hierarchy
6: Space metadata stored for context (space key, name, permissions)
7: Maximum depth configuration to limit recursive operations
