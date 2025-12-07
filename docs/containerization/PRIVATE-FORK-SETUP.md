# Private Fork Setup Guide

This guide walks you through setting up a **PRIVATE** fork of Cortex with upstream sync capability.

## Prerequisites

- GitHub account with access to create private repositories
- Git installed locally
- SSH key configured for GitHub (recommended) or GitHub Personal Access Token

## Step 1: Create Private Fork

**IMPORTANT:** GitHub's fork button creates PUBLIC forks by default. You MUST import the repository to create a private fork.

### Method 1: GitHub Import (Recommended)

1. Go to: https://github.com/new/import
2. Enter the Cortex repository URL:
   ```
   https://github.com/ry-ops/cortex.git
   ```
3. Choose a repository name (e.g., `cortex-private`)
4. **SELECT "Private"** for repository visibility
5. Click "Begin import"
6. Wait for import to complete

### Method 2: Manual Mirror

```bash
# Clone the upstream repository as a bare repo
git clone --bare https://github.com/ry-ops/cortex.git cortex-bare

# Create a new PRIVATE repository on GitHub first
# Then push the mirror to your private repo
cd cortex-bare
git push --mirror https://github.com/YOUR-USERNAME/cortex-private.git

# Cleanup
cd ..
rm -rf cortex-bare
```

## Step 2: Clone Your Private Fork

```bash
# Clone your private fork
git clone git@github.com:YOUR-USERNAME/cortex-private.git
cd cortex-private

# Verify it's private
gh repo view --json visibility
# Should show: "visibility": "PRIVATE"
```

## Step 3: Configure Upstream Remote

```bash
# Add the original Cortex repo as upstream
git remote add upstream https://github.com/ry-ops/cortex.git

# Verify remotes
git remote -v
# Should show:
# origin    git@github.com:YOUR-USERNAME/cortex-private.git (fetch)
# origin    git@github.com:YOUR-USERNAME/cortex-private.git (push)
# upstream  https://github.com/ry-ops/cortex.git (fetch)
# upstream  https://github.com/ry-ops/cortex.git (push)

# Fetch upstream branches
git fetch upstream
```

## Step 4: Create Containerization Branch

```bash
# Create and checkout a new branch for containerization work
git checkout -b docker-container

# Push branch to your private fork
git push -u origin docker-container
```

## Step 5: Configure Repository Settings

### Branch Protection

Protect your main branch:

1. Go to: Settings → Branches
2. Add branch protection rule for `main`:
   - Require pull request reviews before merging
   - Require status checks to pass (once CI/CD is set up)
   - Include administrators
3. Add branch protection rule for `docker-container`:
   - Require pull request reviews (optional for development)

### Secrets and Variables

Add required secrets for CI/CD:

1. Go to: Settings → Secrets and variables → Actions
2. Add repository secrets:

   **Required:**
   - `ANTHROPIC_API_KEY`: Your Anthropic API key

   **Optional:**
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `DOCKERHUB_USERNAME`: Docker Hub username (if using Docker Hub)
   - `DOCKERHUB_TOKEN`: Docker Hub access token

3. Add repository variables:
   - `CORTEX_IMAGE`: Image name (e.g., `ghcr.io/YOUR-USERNAME/cortex`)

### Actions Permissions

1. Go to: Settings → Actions → General
2. Set workflow permissions:
   - **Read and write permissions** (for automated PRs and releases)
   - **Allow GitHub Actions to create and approve pull requests**

## Step 6: Initial Setup

```bash
# Install dependencies
npm install

# Create .env file for local development
cat > .env << 'EOF'
# Anthropic API (required)
ANTHROPIC_API_KEY=your-anthropic-api-key

# OpenAI API (optional)
OPENAI_API_KEY=your-openai-api-key

# MCP Servers (optional)
N8N_MCP_URL=http://10.88.140.149:5678
PROXMOX_MCP_URL=http://10.88.140.151:8006

# Container settings
CORTEX_PORT=3000
DASHBOARD_PORT=3001
LOG_LEVEL=info
EOF

# Add .env to .gitignore (if not already)
echo ".env" >> .gitignore
```

## Step 7: Verify Containerization Files

All containerization files should now be present:

```bash
# Docker files
ls -la Dockerfile docker-compose*.yml .dockerignore

# Kubernetes manifests
ls -la k8s/

# GitHub Actions workflows
ls -la .github/workflows/

# Documentation
ls -la docs/containerization/
```

## Step 8: Test Docker Build

```bash
# Build the Docker image locally
docker build -t cortex:test .

# Run with docker-compose
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Step 9: Commit and Push

```bash
# Add all containerization files
git add Dockerfile* .dockerignore docker-compose*.yml k8s/ .github/workflows/ docs/containerization/ scripts/containerization/

# Commit
git commit -m "Add containerization support

- Multi-stage Dockerfile with security best practices
- Docker Compose configurations (dev, prod)
- Complete Kubernetes manifests
- GitHub Actions workflows for automated builds
- Comprehensive documentation"

# Push to your private fork
git push origin docker-container
```

## Step 10: Enable Automated Upstream Sync

The upstream sync workflow is already configured in `.github/workflows/upstream-sync.yml`.

To enable it:

1. Ensure Actions are enabled in your private repository
2. The workflow will automatically run weekly on Mondays at 2 AM UTC
3. Manual sync: Go to Actions → Upstream Sync → Run workflow

### How Upstream Sync Works

- Runs weekly (schedule) or manually (workflow_dispatch)
- Fetches changes from `ry-ops/cortex`
- Creates a branch with upstream changes
- Automatically creates a PR if changes detected
- Notifies you if conflicts require manual resolution

## Syncing Upstream Changes Manually

```bash
# Fetch upstream changes
git fetch upstream

# Checkout your main branch
git checkout main

# Merge upstream changes
git merge upstream/main

# Resolve any conflicts
# ... edit conflicted files ...
git add .
git commit -m "Merge upstream changes"

# Push to your private fork
git push origin main

# Update your containerization branch
git checkout docker-container
git merge main
git push origin docker-container
```

## Security Checklist

- [ ] Repository visibility is PRIVATE
- [ ] `.env` file is in `.gitignore`
- [ ] Secrets are stored in GitHub Secrets (not code)
- [ ] Branch protection enabled on main
- [ ] Actions permissions configured correctly
- [ ] SSH keys or tokens properly secured

## Verification Commands

```bash
# Verify repository is private
gh repo view --json visibility

# Verify remotes are configured
git remote -v

# Verify current branch
git branch --show-current

# Verify containerization files exist
find . -name "Dockerfile" -o -name "docker-compose.yml" -o -path "*/k8s/*.yaml" | head -20
```

## Troubleshooting

### Fork is Public Instead of Private

If you accidentally created a public fork:

1. Go to Settings → Danger Zone → Change repository visibility
2. Select "Make private"
3. Confirm

### Cannot Push to Fork

Verify authentication:

```bash
# Test SSH connection
ssh -T git@github.com

# Or configure Git credentials
gh auth login
```

### Upstream Sync Conflicts

If automated sync encounters conflicts:

1. Check the PR created by the sync workflow
2. Follow manual resolution steps in the PR description
3. Test thoroughly after resolving conflicts

## Next Steps

1. [Docker Compose Guide](./docker-compose-guide.md)
2. [Kubernetes Deployment Guide](./kubernetes-deployment-guide.md)
3. [CI/CD Pipeline](./ci-cd-pipeline.md)
4. [Containerization Strategy](./CONTAINERIZATION-STRATEGY.md)

## Support

For issues with containerization, check:
- [Troubleshooting Guide](./TROUBLESHOOTING.md)
- [GitHub Issues](https://github.com/YOUR-USERNAME/cortex-private/issues)
