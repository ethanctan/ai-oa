#!/bin/bash
set -e

echo "🚀 Deploying AI OA nginx proxy for multi-tenant setup..."

# Create the Docker network if it doesn't exist
echo "🌐 Creating Docker network 'ai-oa-network'..."
docker network create ai-oa-network --driver bridge || echo "Network already exists"

# Build and start the nginx proxy
echo "🔧 Building nginx proxy container..."
docker-compose up -d nginx-proxy

echo "✅ Nginx proxy deployed successfully!"
echo "🌐 The proxy is now routing *.code.verihire.me subdomains to instance containers"
echo ""
echo "To create test instances, use the admin interface or API"
echo "Each instance will be accessible at https://instance-{id}.code.verihire.me" 