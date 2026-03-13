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

# Create buckets
mc mb --ignore-existing myminio/avatars
mc mb --ignore-existing myminio/files

# Enable anonymous (public) policy for avatars
mc anonymous set download myminio/avatars 2>/dev/null || true

# Configure webhook notification for the files bucket
# Webhook target is pre-configured via MINIO_NOTIFY_WEBHOOK_* env vars on MinIO startup.
# This just binds the event to the pre-configured target.
mc event add myminio/files arn:minio:sqs::1:webhook --event put 2>/dev/null || true

echo "MinIO initialization completed (buckets + webhook)"

# Wait for the MinIO server process
wait $MINIO_PID
