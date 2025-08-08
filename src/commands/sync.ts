import { Command } from 'commander';
import { logger } from '../utils/logger.js';

const syncCommand = new Command('sync')
  .description('Sync between local markdown files and Confluence')
  .action(() => {
    logger.info('Sync command not yet implemented. Use pull or push commands instead.');
  });

export { syncCommand };
export default syncCommand;
