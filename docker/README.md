# AI OA Multi-Tenant Docker Setup

This directory contains the Docker configuration for the AI OA multi-tenant assessment platform. Each test instance runs in its own isolated container, accessible via unique subdomains.

## Architecture

```
Cloudflare (*.verihire.me) 
    ↓
nginx-proxy (routes subdomains)
    ├── verihire.me → "Coming Soon" placeholder (ready for Vercel redirect)
    └── instance-*.verihire.me → Docker containers
```

## How to push changes to the droplet
The droplet has 2 docker images running: ai-oa-public (the main app) and ai-oa-nginx-proxy (the reverse proxy). To update either image, follow these steps:
1. Make changes to the docker image locally
2. Build and push the image to Docker Hub, the repos are `ectan/ai-oa-public` and `ectan/ai-oa-nginx-proxy`
   1. For extension changes, you have to build the .vsix locally, drag it into the docker folder, and then build and push the docker image
3. SSH into the droplet
4. Pull the latest image using `docker pull ectan/ai-oa-public:latest` or `docker pull ectan/ai-oa-nginx-proxy:latest`

## Quick Start

### On droplet restart:
1. Ensure docker is running
```bash
systemctl enable docker
systemctl start docker
docker info | head -n 20
```
2. Go to deployment folder
```bash
cd ai-oa-docker
```
3. Create network for routing and start nginx proxy
```bash
docker network create ai-oa-network --driver bridge || echo "network exists"
docker compose up -d nginx-proxy
docker ps | grep ai-oa-nginx-proxy | cat
```
4. Pull latest docker instance image
```bash
docker pull ectan/ai-oa-public:latest
```
