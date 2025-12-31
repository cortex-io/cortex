#!/bin/bash
# Build and deploy backend-simple with issue detection
set -e

echo "=== Cortex Chat Backend Build ==="

NAMESPACE="cortex-chat"
IMAGE_NAME="cortex-chat-backend-simple"
REGISTRY="10.43.170.72:5000"
SOURCE_DIR="backend-simple"

# Clean up previous build resources
echo "Cleaning up previous build resources..."
kubectl delete pod backend-copy-context -n $NAMESPACE --ignore-not-found=true
kubectl delete job backend-kaniko-build -n $NAMESPACE --ignore-not-found=true
kubectl delete pvc backend-build-context -n $NAMESPACE --ignore-not-found=true

# Create namespace
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create PVC
echo "Creating build context PVC..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: backend-build-context
  namespace: $NAMESPACE
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 500Mi
  storageClassName: longhorn
EOF

# Wait for PVC to be bound
echo "Waiting for PVC to be bound..."
kubectl wait --for=jsonpath='{.status.phase}'=Bound pvc/backend-build-context -n $NAMESPACE --timeout=60s

# Create a pod to copy files
echo "Creating copy pod..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: backend-copy-context
  namespace: $NAMESPACE
spec:
  restartPolicy: Never
  volumes:
  - name: build-context
    persistentVolumeClaim:
      claimName: backend-build-context
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
kubectl wait --for=condition=Ready pod/backend-copy-context -n $NAMESPACE --timeout=120s

# Copy source files
echo "Copying source files to pod..."
kubectl exec -n $NAMESPACE backend-copy-context -- mkdir -p /workspace/src/services
kubectl exec -n $NAMESPACE backend-copy-context -- mkdir -p /workspace/src/routes

# Copy all TypeScript files
kubectl cp $SOURCE_DIR/package.json $NAMESPACE/backend-copy-context:/workspace/package.json
kubectl cp $SOURCE_DIR/tsconfig.json $NAMESPACE/backend-copy-context:/workspace/tsconfig.json
kubectl cp $SOURCE_DIR/Dockerfile $NAMESPACE/backend-copy-context:/workspace/Dockerfile

# Copy source files
kubectl cp $SOURCE_DIR/src/index.ts $NAMESPACE/backend-copy-context:/workspace/src/index.ts
kubectl cp $SOURCE_DIR/src/services/conversation-storage.ts $NAMESPACE/backend-copy-context:/workspace/src/services/conversation-storage.ts
kubectl cp $SOURCE_DIR/src/services/issue-detector.ts $NAMESPACE/backend-copy-context:/workspace/src/services/issue-detector.ts
kubectl cp $SOURCE_DIR/src/services/context-analyzer.ts $NAMESPACE/backend-copy-context:/workspace/src/services/context-analyzer.ts
kubectl cp $SOURCE_DIR/src/services/youtube-detector.ts $NAMESPACE/backend-copy-context:/workspace/src/services/youtube-detector.ts
kubectl cp $SOURCE_DIR/src/services/youtube-workflow.ts $NAMESPACE/backend-copy-context:/workspace/src/services/youtube-workflow.ts
kubectl cp $SOURCE_DIR/src/services/error-recovery.ts $NAMESPACE/backend-copy-context:/workspace/src/services/error-recovery.ts
kubectl cp $SOURCE_DIR/src/routes/auth.ts $NAMESPACE/backend-copy-context:/workspace/src/routes/auth.ts
kubectl cp $SOURCE_DIR/src/routes/chat-simple.ts $NAMESPACE/backend-copy-context:/workspace/src/routes/chat-simple.ts
kubectl cp $SOURCE_DIR/src/routes/conversations.ts $NAMESPACE/backend-copy-context:/workspace/src/routes/conversations.ts

# Verify files copied
echo "Verifying files..."
kubectl exec -n $NAMESPACE backend-copy-context -- sh -c "ls -lah /workspace/ && ls -lah /workspace/src/ && ls -lah /workspace/src/services/ && ls -lah /workspace/src/routes/"

# Delete the copy pod
echo "Cleaning up copy pod..."
kubectl delete pod backend-copy-context -n $NAMESPACE

# Create Kaniko build job
echo "Starting Kaniko build..."
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: backend-kaniko-build
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
          claimName: backend-build-context
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
echo "  kubectl logs -f job/backend-kaniko-build -n $NAMESPACE"
echo ""
echo "After build completes, restart deployment:"
echo "  kubectl rollout restart deployment/cortex-chat-backend -n $NAMESPACE"
echo ""
