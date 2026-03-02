#!/bin/bash
#
# Flux Bootstrap Script
# Run this on the k3s master VM
#

set -euo pipefail

echo "========================================="
echo "Flux Bootstrap Script"
echo "========================================="

# Verify kubectl access
if ! kubectl get nodes &>/dev/null; then
    echo "ERROR: Cannot connect to Kubernetes cluster"
    exit 1
fi

# Install Flux CLI
echo ""
echo "[1/3] Installing Flux CLI..."
if ! command -v flux &> /dev/null; then
    curl -s https://fluxcd.io/install.sh | bash
    export PATH=$PATH:/usr/local/bin
else
    echo "Flux CLI already installed"
fi

# Verify Flux CLI
flux --version

echo ""
echo "========================================="
echo "Flux Bootstrap Options"
echo "========================================="
echo ""
echo "Choose your bootstrap method:"
echo "1) GitHub (HTTPS)"
echo "2) GitLab (HTTPS)"
echo "3) Generic Git (SSH)"
echo "4) Restore from backup"
echo ""
read -p "Select option (1-4): " -n 1 -r OPTION
echo ""

case $OPTION in
    1)
        echo ""
        echo "GitHub Bootstrap Selected"
        echo "You will need:"
        echo "- GitHub Personal Access Token"
        echo "- Repository owner/organization name"
        echo "- Repository name"
        echo ""
        read -p "GitHub Username: " GITHUB_USER
        read -p "GitHub Repository: " GITHUB_REPO
        read -p "Branch (default: main): " GITHUB_BRANCH
        GITHUB_BRANCH=${GITHUB_BRANCH:-main}
        read -p "Path in repo (default: clusters/k3s-vm): " FLUX_PATH
        FLUX_PATH=${FLUX_PATH:-clusters/k3s-vm}
        read -sp "GitHub Token: " GITHUB_TOKEN
        echo ""

        echo ""
        echo "[2/3] Bootstrapping Flux with GitHub..."
        export GITHUB_TOKEN
        flux bootstrap github \
          --owner=$GITHUB_USER \
          --repository=$GITHUB_REPO \
          --branch=$GITHUB_BRANCH \
          --path=$FLUX_PATH \
          --personal
        ;;

    2)
        echo ""
        echo "GitLab Bootstrap Selected"
        echo "You will need:"
        echo "- GitLab Personal Access Token"
        echo "- Repository owner/group name"
        echo "- Repository name"
        echo ""
        read -p "GitLab Username/Group: " GITLAB_USER
        read -p "GitLab Repository: " GITLAB_REPO
        read -p "Branch (default: main): " GITLAB_BRANCH
        GITLAB_BRANCH=${GITLAB_BRANCH:-main}
        read -p "Path in repo (default: clusters/k3s-vm): " FLUX_PATH
        FLUX_PATH=${FLUX_PATH:-clusters/k3s-vm}
        read -sp "GitLab Token: " GITLAB_TOKEN
        echo ""

        echo ""
        echo "[2/3] Bootstrapping Flux with GitLab..."
        export GITLAB_TOKEN
        flux bootstrap gitlab \
          --owner=$GITLAB_USER \
          --repository=$GITLAB_REPO \
          --branch=$GITLAB_BRANCH \
          --path=$FLUX_PATH \
          --token-auth \
          --personal
        ;;

    3)
        echo ""
        echo "Generic Git (SSH) Bootstrap Selected"
        echo "You will need:"
        echo "- Git repository URL (SSH format)"
        echo "- SSH private key with access to repository"
        echo ""
        read -p "Git URL (e.g., ssh://git@example.com/repo.git): " GIT_URL
        read -p "Branch (default: main): " GIT_BRANCH
        GIT_BRANCH=${GIT_BRANCH:-main}
        read -p "Path in repo (default: clusters/k3s-vm): " FLUX_PATH
        FLUX_PATH=${FLUX_PATH:-clusters/k3s-vm}
        read -p "SSH Private Key Path: " SSH_KEY_PATH

        echo ""
        echo "[2/3] Bootstrapping Flux with generic Git..."
        flux bootstrap git \
          --url=$GIT_URL \
          --branch=$GIT_BRANCH \
          --path=$FLUX_PATH \
          --private-key-file=$SSH_KEY_PATH
        ;;

    4)
        echo ""
        echo "Restore from Backup Selected"
        echo ""
        read -p "Path to backup directory: " BACKUP_PATH

        if [ ! -d "$BACKUP_PATH" ]; then
            echo "ERROR: Backup directory not found: $BACKUP_PATH"
            exit 1
        fi

        echo ""
        echo "[2/3] Installing Flux components..."
        flux install

        echo ""
        echo "Waiting for Flux to be ready..."
        kubectl wait --for=condition=ready pod -n flux-system --all --timeout=300s

        echo ""
        echo "Restoring Flux configuration from backup..."

        if [ -f "$BACKUP_PATH/flux-secret.yaml" ]; then
            kubectl apply -f $BACKUP_PATH/flux-secret.yaml
        fi

        if [ -f "$BACKUP_PATH/flux-gitrepository.yaml" ]; then
            kubectl apply -f $BACKUP_PATH/flux-gitrepository.yaml
        fi

        if [ -f "$BACKUP_PATH/flux-helmrepositories.yaml" ]; then
            kubectl apply -f $BACKUP_PATH/flux-helmrepositories.yaml
        fi

        if [ -f "$BACKUP_PATH/flux-kustomizations.yaml" ]; then
            kubectl apply -f $BACKUP_PATH/flux-kustomizations.yaml
        fi

        if [ -f "$BACKUP_PATH/flux-helmreleases.yaml" ]; then
            kubectl apply -f $BACKUP_PATH/flux-helmreleases.yaml
        fi
        ;;

    *)
        echo "Invalid option"
        exit 1
        ;;
esac

# Verify Flux installation
echo ""
echo "[3/3] Verifying Flux installation..."
sleep 10
kubectl get pods -n flux-system

echo ""
echo "========================================="
echo "Flux Bootstrap Complete!"
echo "========================================="
echo ""
echo "Verification commands:"
echo "  flux get sources all"
echo "  flux get kustomizations"
echo "  flux get helmreleases -A"
echo "  flux logs --all-namespaces --follow"
echo ""
echo "Next steps:"
echo "1. Verify Flux is reconciling: flux get all -A"
echo "2. Monitor Flux logs: flux logs -A --follow"
echo "3. Proceed with Phase 6: Deploy Core Services"
