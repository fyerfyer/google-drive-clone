#!/bin/bash
# MongoDB Replica Set Initialization Script
# This script runs when MongoDB starts for the first time

set -e

echo "Waiting for MongoDB to be ready..."
until mongosh --quiet --eval "db.adminCommand('ping')" > /dev/null 2>&1; do
  sleep 1
done

echo "MongoDB is ready. Initializing replica set..."

# Initialize replica set
mongosh --eval "
try {
  var status = rs.status();
  print('Replica set already initialized');
} catch (err) {
  print('Initializing replica set...');
  rs.initiate({
    _id: 'rs0',
    members: [{ _id: 0, host: 'localhost:27017' }]
  });
  print('Replica set initialized successfully');
}
"

echo "MongoDB initialization complete!"
