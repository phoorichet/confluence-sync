import type { Command } from 'commander';
import { getVersion } from '../utils/package-info.js';

export function registerHealthCommand(program: Command): void {
  program
    .command('health')
    .description('Check the health status of confluence-sync')
    .action(() => {
      const version = getVersion();
      console.log(`Confluence Sync v${version} - OK`);
    });
}
