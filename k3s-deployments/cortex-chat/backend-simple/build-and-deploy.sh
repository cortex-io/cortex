#!/bin/bash
# Build and deploy backend with SSE stream parsing fix
set -e

echo "=== Backend Build and Deploy ==="
echo "Building image with new /api/chat SSE stream parsing..."

NAMESPACE="cortex-chat"
IMAGE_NAME="cortex-chat-backend-simple"
REGISTRY="10.43.170.72:5000"
TAG="sse-stream-fix"

# Clean up any previous build resources
echo "Cleaning up previous build resources..."
kubectl delete pod backend-copy-context -n $NAMESPACE --ignore-not-found=true
kubectl delete job backend-kaniko-build -n $NAMESPACE --ignore-not-found=true
kubectl delete pvc backend-build-context -n $NAMESPACE --ignore-not-found=true

# Create namespace if it doesn't exist
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create ConfigMap with source (create tar of src directory)
echo "Creating source tarball..."
tar czf /tmp/backend-src.tar.gz Dockerfile package.json src/

echo "Creating ConfigMap with source tarball..."
kubectl create configmap backend-source \
  --from-file=backend-src.tar.gz=/tmp/backend-src.tar.gz \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

# Create build PVC
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
      storage: 100Mi
EOF

# Copy source files to PVC
echo "Copying source files to PVC..."
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
  - name: source
    configMap:
      name: backend-source
  containers:
  - name: copy
    image: busybox
    command: ["/bin/sh", "-c"]
    args:
      - |
        echo "Extracting source tarball..."
        cd /workspace
        tar xzf /source/backend-src.tar.gz
        echo "Files extracted:"
        ls -la /workspace/
        ls -la /workspace/src/ | head -20
    volumeMounts:
    - name: build-context
      mountPath: /workspace
    - name: source
      mountPath: /source
EOF

# Wait for copy to complete
echo "Waiting for copy to complete..."
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/backend-copy-context -n $NAMESPACE --timeout=60s || {
  echo "Copy pod failed, checking status..."
  kubectl get pod backend-copy-context -n $NAMESPACE
  kubectl logs pod/backend-copy-context -n $NAMESPACE
  exit 1
}

echo "Copy completed. Starting Kaniko build..."

# Run Kaniko build
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: backend-kaniko-build
  namespace: $NAMESPACE
spec:
  ttlSecondsAfterFinished: 600
  template:
    spec:
      restartPolicy: Never
      volumes:
      - name: build-context
        persistentVolumeClaim:
          claimName: backend-build-context
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
echo "Run: kubectl logs -f job/backend-kaniko-build -n $NAMESPACE"
echo ""
echo "After build completes, deploy with:"
echo "  kubectl rollout restart deployment/cortex-chat-backend-simple -n $NAMESPACE"
echo "  kubectl rollout status deployment/cortex-chat-backend-simple -n $NAMESPACE"
echo ""
echo "Monitor build: kubectl get pods -n $NAMESPACE -l job-name=backend-kaniko-build"
