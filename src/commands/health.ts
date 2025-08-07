import { Command } from 'commander';
import { getVersion } from '../utils/package-info.js';

export const healthCommand = new Command('health')
  .description('Check the health status of confluence-sync')
  .action(() => {
    const version = getVersion();
    console.log(`Confluence Sync v${version} - OK`);
  });

export default healthCommand;
