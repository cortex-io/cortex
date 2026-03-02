#!/bin/bash
# Build and deploy cortex-chat frontend with conversation fixes
set -e

echo "=== Cortex Chat Frontend Build and Deploy ==="
echo "Building image with conversation title and delete fixes..."

NAMESPACE="cortex-chat"
IMAGE_NAME="cortex-chat"
REGISTRY="10.43.170.72:5000"
TAG="conversation-fix"

# Clean up any previous build resources
echo "Cleaning up previous build resources..."
kubectl delete pod frontend-copy-context -n $NAMESPACE --ignore-not-found=true
kubectl delete job frontend-kaniko-build -n $NAMESPACE --ignore-not-found=true
kubectl delete pvc frontend-build-context -n $NAMESPACE --ignore-not-found=true

# Create namespace if it doesn't exist
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create build PVC
echo "Creating build context PVC..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: frontend-build-context
  namespace: $NAMESPACE
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 100Mi
EOF

# Copy source files to PVC
echo "Copying source files to PVC..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: frontend-copy-context
  namespace: $NAMESPACE
spec:
  restartPolicy: Never
  volumes:
  - name: build-context
    persistentVolumeClaim:
      claimName: frontend-build-context
  - name: source
    hostPath:
      path: /Users/ryandahlberg/Projects/cortex/k3s-deployments/cortex-chat/frontend-redesign
      type: Directory
  containers:
  - name: copy
    image: busybox
    command: ["/bin/sh", "-c"]
    args:
      - |
        echo "Copying files to build context..."
        cp -r /source/* /workspace/
        echo "Files copied:"
        ls -la /workspace/
    volumeMounts:
    - name: build-context
      mountPath: /workspace
    - name: source
      mountPath: /source
EOF

# Wait for copy to complete
echo "Waiting for copy to complete..."
kubectl wait --for=condition=Ready pod/frontend-copy-context -n $NAMESPACE --timeout=60s || true
sleep 5
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/frontend-copy-context -n $NAMESPACE --timeout=60s

echo "Copy completed. Starting Kaniko build..."

# Run Kaniko build
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: frontend-kaniko-build
  namespace: $NAMESPACE
spec:
  ttlSecondsAfterFinished: 600
  template:
    spec:
      restartPolicy: Never
      volumes:
      - name: build-context
        persistentVolumeClaim:
          claimName: frontend-build-context
      - name: docker-config
        emptyDir: {}
      initContainers:
      - name: create-docker-config
        image: busybox
        command: ["/bin/sh", "-c"]
        args:
          - |
            mkdir -p /kaniko/.docker
            echo '{"insecureRegistries":["$REGISTRY"]}' > /kaniko/.docker/config.json
        volumeMounts:
        - name: docker-config
          mountPath: /kaniko/.docker
      containers:
      - name: kaniko
        image: gcr.io/kaniko-project/executor:latest
        args:
          - "--dockerfile=/workspace/Dockerfile"
          - "--context=/workspace"
          - "--destination=$REGISTRY/$IMAGE_NAME:latest"
          - "--destination=$REGISTRY/$IMAGE_NAME:$TAG"
          - "--insecure"
          - "--skip-tls-verify"
          - "--verbosity=info"
        volumeMounts:
        - name: build-context
          mountPath: /workspace
        - name: docker-config
          mountPath: /kaniko/.docker
EOF

echo "Kaniko build job created. Monitoring build progress..."
echo "Run: kubectl logs -f job/frontend-kaniko-build -n $NAMESPACE"
echo ""
echo "After build completes, deploy with:"
echo "  kubectl rollout restart deployment/cortex-chat -n $NAMESPACE"
echo "  kubectl rollout status deployment/cortex-chat -n $NAMESPACE"
echo ""
echo "Monitor build: kubectl get pods -n $NAMESPACE -l job-name=frontend-kaniko-build"
