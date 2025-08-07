#!/usr/bin/env bun

import process from 'node:process';
import { Command } from 'commander';
import { registerHealthCommand } from './commands/health.js';
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
registerHealthCommand(program);

// Parse command line arguments
program.parse(process.argv);
