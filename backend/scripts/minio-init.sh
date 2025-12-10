#!/bin/sh
set -e

# Start MinIO server in the background
minio server /data --console-address ":9001" &
MINIO_PID=$!

# Wait for MinIO to be ready
echo "Waiting for MinIO to start..."
sleep 5

# Configure MinIO client
mc alias set myminio http://localhost:9000 ${MINIO_ROOT_USER:-minioadmin} ${MINIO_ROOT_PASSWORD:-minioadmin123}

# Enable anonymous (public) policy for both buckets to allow CORS
mc anonymous set download myminio/avatars 2>/dev/null || true
mc anonymous set download myminio/files 2>/dev/null || true

echo "MinIO CORS configuration completed"

# Wait for the MinIO server process
wait $MINIO_PID
