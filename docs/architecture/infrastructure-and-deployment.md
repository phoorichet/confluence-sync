# Infrastructure and Deployment

## Infrastructure as Code

- **Tool:** GitHub Actions workflows
- **Location:** `.github/workflows/`
- **Approach:** Declarative YAML workflows for CI/CD automation

## Deployment Strategy

- **Strategy:** Continuous deployment on tagged releases
- **CI/CD Platform:** GitHub Actions
- **Pipeline Configuration:** `.github/workflows/release.yml`

## Environments

- **Development:** Local development with Bun runtime, hot reload via `bun run`
- **Testing:** GitHub Actions runners for automated testing on PR
- **Staging:** Pre-release versions published to NPM with beta tag
- **Production:** Stable releases published to NPM with latest tag

## Environment Promotion Flow

```
Local Dev → Feature Branch → PR (CI Tests) → Main Branch →
Release Tag → NPM Beta → Manual Testing → NPM Latest
```

## Rollback Strategy

- **Primary Method:** NPM version rollback (`npm install confluence-sync@previous-version`)
- **Trigger Conditions:** Critical bugs, data corruption issues, API breaking changes
- **Recovery Time Objective:** < 5 minutes (user reinstalls previous version)
