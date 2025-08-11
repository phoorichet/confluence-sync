import process from 'node:process';
import chalk from 'chalk';
import { Command } from 'commander';
import { promptManager } from '../utils/prompts';

const BASH_COMPLETION = `#!/bin/bash
# Bash completion for confluence-sync
_confluence_sync_completion() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    # Main commands
    local commands="auth pull push sync status init config completion help"
    
    # Subcommands
    local auth_commands="status clear"
    local config_commands="get set list"
    
    # Global options
    local global_opts="--help --version --json --no-colors --verbose"
    
    case "\${COMP_CWORD}" in
        1)
            COMPREPLY=( $(compgen -W "\${commands}" -- \${cur}) )
            return 0
            ;;
        2)
            case "\${prev}" in
                auth)
                    COMPREPLY=( $(compgen -W "\${auth_commands} --url --email --token" -- \${cur}) )
                    return 0
                    ;;
                pull|push)
                    COMPREPLY=( $(compgen -W "--force --dry-run --pattern" -- \${cur}) )
                    return 0
                    ;;
                sync)
                    COMPREPLY=( $(compgen -W "--strategy --auto --watch" -- \${cur}) )
                    return 0
                    ;;
                config)
                    COMPREPLY=( $(compgen -W "\${config_commands}" -- \${cur}) )
                    return 0
                    ;;
                completion)
                    COMPREPLY=( $(compgen -W "bash zsh fish" -- \${cur}) )
                    return 0
                    ;;
            esac
            ;;
        *)
            COMPREPLY=( $(compgen -W "\${global_opts}" -- \${cur}) )
            return 0
            ;;
    esac
}

complete -F _confluence_sync_completion confluence-sync
`;

const ZSH_COMPLETION = `#compdef confluence-sync
# Zsh completion for confluence-sync

_confluence_sync() {
    local -a commands
    commands=(
        'auth:Authenticate with Confluence'
        'pull:Pull pages from Confluence'
        'push:Push local changes to Confluence'
        'sync:Synchronize with Confluence'
        'status:Check sync status'
        'init:Initialize configuration'
        'config:Manage configuration'
        'completion:Generate shell completions'
        'help:Show help'
    )

    local -a auth_commands
    auth_commands=(
        'status:Check authentication status'
        'clear:Clear stored credentials'
    )

    local -a config_commands
    config_commands=(
        'get:Get configuration value'
        'set:Set configuration value'
        'list:List all configuration'
    )

    _arguments -C \\
        '1: :->command' \\
        '2: :->subcommand' \\
        '*::arg:->args'

    case $state in
        command)
            _describe 'command' commands
            ;;
        subcommand)
            case $words[2] in
                auth)
                    _describe 'auth subcommand' auth_commands
                    ;;
                config)
                    _describe 'config subcommand' config_commands
                    ;;
                completion)
                    _values 'shell' 'bash' 'zsh' 'fish'
                    ;;
            esac
            ;;
        args)
            case $words[2] in
                pull|push)
                    _arguments \\
                        '--force[Force operation]' \\
                        '--dry-run[Simulate operation]' \\
                        '--pattern[File pattern]:pattern:'
                    ;;
                sync)
                    _arguments \\
                        '--strategy[Conflict strategy]:strategy:(manual local-first remote-first)' \\
                        '--auto[Auto-resolve conflicts]' \\
                        '--watch[Watch mode]'
                    ;;
            esac
            ;;
    esac
}

_confluence_sync "$@"
`;

const FISH_COMPLETION = `# Fish completion for confluence-sync
complete -c confluence-sync -n "__fish_use_subcommand" -a auth -d "Authenticate with Confluence"
complete -c confluence-sync -n "__fish_use_subcommand" -a pull -d "Pull pages from Confluence"
complete -c confluence-sync -n "__fish_use_subcommand" -a push -d "Push local changes to Confluence"
complete -c confluence-sync -n "__fish_use_subcommand" -a sync -d "Synchronize with Confluence"
complete -c confluence-sync -n "__fish_use_subcommand" -a status -d "Check sync status"
complete -c confluence-sync -n "__fish_use_subcommand" -a init -d "Initialize configuration"
complete -c confluence-sync -n "__fish_use_subcommand" -a config -d "Manage configuration"
complete -c confluence-sync -n "__fish_use_subcommand" -a completion -d "Generate shell completions"
complete -c confluence-sync -n "__fish_use_subcommand" -a help -d "Show help"

# Auth subcommands
complete -c confluence-sync -n "__fish_seen_subcommand_from auth" -a status -d "Check authentication status"
complete -c confluence-sync -n "__fish_seen_subcommand_from auth" -a clear -d "Clear stored credentials"

# Config subcommands
complete -c confluence-sync -n "__fish_seen_subcommand_from config" -a get -d "Get configuration value"
complete -c confluence-sync -n "__fish_seen_subcommand_from config" -a set -d "Set configuration value"
complete -c confluence-sync -n "__fish_seen_subcommand_from config" -a list -d "List all configuration"

# Completion shells
complete -c confluence-sync -n "__fish_seen_subcommand_from completion" -a bash -d "Bash shell"
complete -c confluence-sync -n "__fish_seen_subcommand_from completion" -a zsh -d "Zsh shell"
complete -c confluence-sync -n "__fish_seen_subcommand_from completion" -a fish -d "Fish shell"

# Global options
complete -c confluence-sync -l help -d "Show help"
complete -c confluence-sync -l version -d "Show version"
complete -c confluence-sync -l json -d "Output in JSON format"
complete -c confluence-sync -l no-colors -d "Disable colored output"
complete -c confluence-sync -l verbose -d "Verbose output"

# Command-specific options
complete -c confluence-sync -n "__fish_seen_subcommand_from pull push" -l force -d "Force operation"
complete -c confluence-sync -n "__fish_seen_subcommand_from pull push" -l dry-run -d "Simulate operation"
complete -c confluence-sync -n "__fish_seen_subcommand_from pull push" -l pattern -d "File pattern"

complete -c confluence-sync -n "__fish_seen_subcommand_from sync" -l strategy -d "Conflict strategy"
complete -c confluence-sync -n "__fish_seen_subcommand_from sync" -l auto -d "Auto-resolve conflicts"
complete -c confluence-sync -n "__fish_seen_subcommand_from sync" -l watch -d "Watch mode"
`;

export const completionCommand = new Command('completion')
  .description('Generate shell completion script')
  .argument('[shell]', 'Shell type (bash, zsh, or fish)')
  .action(async (shell?: string) => {
    try {
      // If no shell specified, try to detect or prompt
      if (!shell) {
        if (promptManager.isInteractive()) {
          shell = await promptManager.select(
            'Select your shell:',
            [
              { title: 'Bash', value: 'bash', description: 'Bourne Again Shell' },
              { title: 'Zsh', value: 'zsh', description: 'Z Shell' },
              { title: 'Fish', value: 'fish', description: 'Friendly Interactive Shell' },
            ],
          );
        }
        else {
          // Try to detect from environment
          const currentShell = process.env.SHELL || '';
          if (currentShell.includes('bash')) {
            shell = 'bash';
          }
          else if (currentShell.includes('zsh')) {
            shell = 'zsh';
          }
          else if (currentShell.includes('fish')) {
            shell = 'fish';
          }
          else {
            console.error(chalk.red('Could not detect shell. Please specify: confluence-sync completion [bash|zsh|fish]'));
            process.exit(1);
          }
        }
      }

      let script: string;
      let instructions: string;

      switch (shell.toLowerCase()) {
        case 'bash':
          script = BASH_COMPLETION;
          instructions = `
${chalk.cyan('Installation for Bash:')}

1. Save the completion script:
   ${chalk.gray('confluence-sync completion bash > ~/.confluence-sync-completion.bash')}

2. Add to your ~/.bashrc or ~/.bash_profile:
   ${chalk.gray('source ~/.confluence-sync-completion.bash')}

3. Reload your shell:
   ${chalk.gray('source ~/.bashrc')}
`;
          break;

        case 'zsh':
          script = ZSH_COMPLETION;
          instructions = `
${chalk.cyan('Installation for Zsh:')}

1. Save the completion script:
   ${chalk.gray('confluence-sync completion zsh > ~/.confluence-sync-completion.zsh')}

2. Add to your ~/.zshrc:
   ${chalk.gray('fpath=(~/.confluence-sync-completion.zsh $fpath)')}
   ${chalk.gray('autoload -Uz compinit && compinit')}

3. Reload your shell:
   ${chalk.gray('source ~/.zshrc')}
`;
          break;

        case 'fish':
          script = FISH_COMPLETION;
          instructions = `
${chalk.cyan('Installation for Fish:')}

1. Save the completion script:
   ${chalk.gray('confluence-sync completion fish > ~/.config/fish/completions/confluence-sync.fish')}

2. Completions will be available immediately in new shells
`;
          break;

        default:
          console.error(chalk.red(`Unknown shell: ${shell}`));
          console.error(chalk.gray('Supported shells: bash, zsh, fish'));
          process.exit(1);
      }

      // Output the script
      console.log(script);

      // Show instructions if interactive
      if (promptManager.isInteractive()) {
        console.error(''); // Empty line to stderr
        console.error(instructions);
      }
    }
    catch (error) {
      if (error instanceof Error) {
        console.error(chalk.red(`Error: ${error.message}`));
      }
      process.exit(1);
    }
  });

export default completionCommand;
