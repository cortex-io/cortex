#!/bin/bash
# Build and deploy cortex-api with multi-turn tool use fix
set -e

echo "=== Cortex API Build and Deploy ==="
echo "Building image with multi-turn tool use fix..."

NAMESPACE="cortex"
IMAGE_NAME="cortex-api"
REGISTRY="10.43.170.72:5000"
TAG="multi-turn-fix"

# Clean up any previous build resources
echo "Cleaning up previous build resources..."
kubectl delete pod cortex-api-copy-context -n $NAMESPACE --ignore-not-found=true
kubectl delete job cortex-api-kaniko-build -n $NAMESPACE --ignore-not-found=true
kubectl delete pvc cortex-api-build-context -n $NAMESPACE --ignore-not-found=true

# Create namespace if it doesn't exist
kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Create ConfigMap with updated server.js
echo "Creating ConfigMap with updated server.js..."
kubectl create configmap cortex-api-source \
  --from-file=server.js=server.js \
  --from-file=package.json=package.json \
  --from-file=token-throttle.js=token-throttle.js \
  --from-file=prometheus-metrics.js=prometheus-metrics.js \
  --from-file=self-heal-worker.sh=scripts/self-heal-worker.sh \
  --from-file=Dockerfile=Dockerfile \
  -n $NAMESPACE \
  --dry-run=client -o yaml | kubectl apply -f -

# Create build PVC
echo "Creating build context PVC..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: cortex-api-build-context
  namespace: $NAMESPACE
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 200Mi
EOF

# Copy source files to PVC
echo "Copying source files to PVC..."
cat <<EOF | kubectl apply -f -
apiVersion: v1
kind: Pod
metadata:
  name: cortex-api-copy-context
  namespace: $NAMESPACE
spec:
  restartPolicy: Never
  volumes:
  - name: build-context
    persistentVolumeClaim:
      claimName: cortex-api-build-context
  - name: source
    configMap:
      name: cortex-api-source
  containers:
  - name: copy
    image: busybox
    command: ["/bin/sh", "-c"]
    args:
      - |
        echo "Copying files to build context..."
        cp /source/Dockerfile /workspace/
        cp /source/server.js /workspace/
        cp /source/package.json /workspace/
        cp /source/token-throttle.js /workspace/
        cp /source/prometheus-metrics.js /workspace/
        mkdir -p /workspace/scripts
        cp /source/self-heal-worker.sh /workspace/scripts/
        chmod +x /workspace/scripts/self-heal-worker.sh
        echo "Files copied:"
        ls -la /workspace/
        ls -la /workspace/scripts/
    volumeMounts:
    - name: build-context
      mountPath: /workspace
    - name: source
      mountPath: /source
EOF

# Wait for copy to complete
echo "Waiting for copy to complete..."
kubectl wait --for=condition=Ready pod/cortex-api-copy-context -n $NAMESPACE --timeout=60s || true
sleep 5
kubectl wait --for=jsonpath='{.status.phase}'=Succeeded pod/cortex-api-copy-context -n $NAMESPACE --timeout=60s

echo "Copy completed. Starting Kaniko build..."

# Run Kaniko build
cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: cortex-api-kaniko-build
  namespace: $NAMESPACE
spec:
  ttlSecondsAfterFinished: 600
  template:
    spec:
      restartPolicy: Never
      volumes:
      - name: build-context
        persistentVolumeClaim:
          claimName: cortex-api-build-context
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
echo "Run: kubectl logs -f job/cortex-api-kaniko-build -n $NAMESPACE"
echo ""
echo "After build completes, deploy with:"
echo "  kubectl rollout restart deployment/cortex-orchestrator -n $NAMESPACE"
echo "  kubectl rollout status deployment/cortex-orchestrator -n $NAMESPACE"
echo ""
echo "Monitor build: kubectl get pods -n $NAMESPACE -l job-name=cortex-api-kaniko-build"
