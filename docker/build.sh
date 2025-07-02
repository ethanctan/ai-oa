#!/bin/bash

# Build for AMD64 only
docker build \
  --platform linux/amd64 \
  -t ectan/ai-oa-public:latest \
  .

# Push to Docker Hub
docker push ectan/ai-oa-public:latest 