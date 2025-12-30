#!/bin/bash
# Build and deploy cortex-chat frontend - FIXED version
set -e

echo "=== Cortex Chat Frontend Build (Fixed) ==="

NAMESPACE="cortex-chat"
IMAGE_NAME="cortex-chat-frontend"
REGISTRY="10.43.170.72:5000"
SOURCE_DIR="frontend-redesign"

# Clean up previous build resources
echo "Cleaning up previous build resources..."
kubectl delete pod frontend-copy-context -n $NAMESPACE --ignore-not-found=true
kubectl delete job frontend-kaniko-build -n $NAMESPACE --ignore-not-found=true
kubectl delete pvc frontend-build-context -n $NAMESPACE --ignore-not-found=true

# Create namespace
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create PVC
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
  storageClassName: longhorn
EOF

# Wait for PVC to be bound
echo "Waiting for PVC to be bound..."
kubectl wait --for=jsonpath='{.status.phase}'=Bound pvc/frontend-build-context -n $NAMESPACE --timeout=60s

# Create a simple pod to receive files
echo "Creating copy pod..."
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
  containers:
  - name: copy
    image: busybox
    command: ["sh", "-c", "sleep 3600"]
    volumeMounts:
    - name: build-context
      mountPath: /workspace
EOF

# Wait for pod to be ready
echo "Waiting for copy pod to be ready..."
kubectl wait --for=condition=Ready pod/frontend-copy-context -n $NAMESPACE --timeout=120s

# Copy files using kubectl cp
echo "Copying source files to pod..."
kubectl exec -n $NAMESPACE frontend-copy-context -- mkdir -p /workspace

# Check if nginx.conf exists and copy if present
if [ -f $SOURCE_DIR/nginx.conf ]; then
  kubectl cp $SOURCE_DIR/nginx.conf $NAMESPACE/frontend-copy-context:/workspace/nginx.conf
else
  echo "No nginx.conf found, creating simple Dockerfile..."
  # Create a simpler Dockerfile that doesn't need nginx.conf
  cat > /tmp/Dockerfile.simple <<'DOCKEREOF'
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
EXPOSE 80
DOCKEREOF
  kubectl cp /tmp/Dockerfile.simple $NAMESPACE/frontend-copy-context:/workspace/Dockerfile
fi

# Always copy index.html
kubectl cp $SOURCE_DIR/index.html $NAMESPACE/frontend-copy-context:/workspace/index.html

# Copy original Dockerfile only if we found nginx.conf
if [ -f $SOURCE_DIR/nginx.conf ]; then
  kubectl cp $SOURCE_DIR/Dockerfile $NAMESPACE/frontend-copy-context:/workspace/Dockerfile
fi

# Verify files copied
echo "Verifying files..."
kubectl exec -n $NAMESPACE frontend-copy-context -- ls -lah /workspace/

# Delete the copy pod
echo "Cleaning up copy pod..."
kubectl delete pod frontend-copy-context -n $NAMESPACE

# Create Kaniko build job
echo "Starting Kaniko build..."
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: frontend-kaniko-build
  namespace: $NAMESPACE
spec:
  ttlSecondsAfterFinished: 600
  backoffLimit: 1
  template:
    spec:
      restartPolicy: Never
      volumes:
      - name: build-context
        persistentVolumeClaim:
          claimName: frontend-build-context
      containers:
      - name: kaniko
        image: gcr.io/kaniko-project/executor:latest
        args:
          - "--dockerfile=/workspace/Dockerfile"
          - "--context=/workspace"
          - "--destination=$REGISTRY/$IMAGE_NAME:latest"
          - "--insecure"
          - "--skip-tls-verify"
          - "--verbosity=info"
        volumeMounts:
        - name: build-context
          mountPath: /workspace
EOF

echo ""
echo "✅ Build job created!"
echo ""
echo "Monitor build progress:"
echo "  kubectl logs -f job/frontend-kaniko-build -n $NAMESPACE"
echo ""
echo "After build completes, restart deployment:"
echo "  kubectl rollout restart deployment/cortex-chat -n $NAMESPACE"
echo ""
