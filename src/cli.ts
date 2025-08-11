#!/usr/bin/env bun

import process from 'node:process';
import { Command } from 'commander';
import { authCommand } from './commands/auth.js';
import { completionCommand } from './commands/completion.js';
import { conflictsCommand } from './commands/conflicts.js';
import { healthCommand } from './commands/health.js';
import { initCommand } from './commands/init.js';
import { pullCommand } from './commands/pull.js';
import { pushCommand } from './commands/push.js';
import { statusCommand } from './commands/status.js';
import { syncCommand } from './commands/sync.js';
import { watchCommand } from './commands/watch.js';
import { getPackageInfo } from './utils/package-info.js';

// Get package information
const packageInfo = getPackageInfo();

// Create the main command
const program = new Command();

program
  .name(packageInfo.name)
  .description(packageInfo.description || 'Bi-directional sync tool for Confluence and local markdown files')
  .version(packageInfo.version);

// Register commands
program.addCommand(authCommand);
program.addCommand(completionCommand);
program.addCommand(conflictsCommand);
program.addCommand(healthCommand);
program.addCommand(initCommand);
program.addCommand(pullCommand);
program.addCommand(pushCommand);
program.addCommand(statusCommand);
program.addCommand(syncCommand);
program.addCommand(watchCommand);

// Parse command line arguments
program.parse(process.argv);
