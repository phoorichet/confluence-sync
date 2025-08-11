export interface WatchConfig {
  enabled: boolean;
  debounceDelay: number;
  ignorePatterns: string[];
  notificationsEnabled: boolean;
  retryAttempts: number;
  retryDelay: number;
}

export interface WatchStatus {
  active: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
  currentOperation: 'idle' | 'syncing' | 'retrying' | null;
  failureCount: number;
}
