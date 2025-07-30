# AI OA Multi-Tenant Docker Setup

This directory contains the Docker configuration for the AI OA multi-tenant assessment platform. Each test instance runs in its own isolated container, accessible via unique subdomains.

## Architecture

```
Cloudflare (*.verihire.me) 
    ↓
nginx-proxy (routes subdomains)
    ↓
instance-123 (code-server container)
instance-456 (code-server container)
instance-789 (code-server container)
```

## Quick Start

### 1. Deploy the nginx proxy
```bash
cd docker
./deploy-proxy.sh
```

### 2. Create test instances through the admin interface
- Go to your admin panel
- Create a test and assign candidates
- Each instance will automatically get a unique subdomain

### 3. Access instances
- Instance 123: https://instance-123.verihire.me
- Instance 456: https://instance-456.verihire.me

## Files

- `nginx.conf` - Routes subdomains to containers
- `nginx-proxy.Dockerfile` - Nginx proxy container
- `simple.Dockerfile` - Instance container (code-server)
- `simple-startup.sh` - Startup script for instances
- `docker-compose.yml` - Proxy deployment configuration
- `deploy-proxy.sh` - Deployment script
- `manage-instances.sh` - Instance management utilities

## Management

### List running instances
```bash
./manage-instances.sh list
```

### Stop an instance
```bash
./manage-instances.sh stop 123
```

### View instance logs
```bash
./manage-instances.sh logs 123
```

### Cleanup stopped containers
```bash
./manage-instances.sh cleanup
```

### View network information
```bash
./manage-instances.sh network
```

## How it works

1. **nginx-proxy container**: Runs on port 80 and routes `instance-*.verihire.me` to the appropriate container
2. **ai-oa-network**: Docker bridge network for internal communication
3. **Instance containers**: Each named `instance-{id}` running code-server on port 80
4. **Cloudflare**: Handles SSL termination and DNS for `*.verihire.me`

## Network Flow

1. User visits `https://instance-123.verihire.me`
2. Cloudflare handles SSL and forwards to nginx-proxy:80
3. nginx extracts instance ID (123) from subdomain
4. nginx forwards request to `instance-123:80` on ai-oa-network
5. Instance container serves code-server interface

## Scaling

The system automatically scales by:
- Creating new containers when instances are requested
- Using Docker network for internal communication (no port conflicts)
- Each container is isolated with its own filesystem and environment

## Cloudflare Setup

### DNS Configuration
Add this wildcard DNS record in Cloudflare:
```
Type: A
Name: *.verihire.me
IPv4 address: 167.99.52.130
Proxy status: Proxied (🟠 orange cloud)
```

### SSL/TLS Settings
- Go to SSL/TLS → Overview
- Set encryption mode to: **"Full"**
- Cloudflare's free plan covers `*.verihire.me` wildcards

## Troubleshooting

### Container not accessible
```bash
# Check if container is running
./manage-instances.sh list

# Check container logs
./manage-instances.sh logs <instance_id>

# Check network connectivity
./manage-instances.sh network
```

### nginx proxy issues
```bash
# Check proxy logs
docker logs nginx-proxy

# Restart proxy
docker-compose restart nginx-proxy
```

### DNS/SSL issues
```bash
# Test direct routing (bypassing SSL)
curl -H "Host: instance-123.verihire.me" http://167.99.52.130/

# Check DNS resolution
nslookup instance-123.verihire.me
```

### Network issues
```bash
# Recreate network
docker network rm ai-oa-network
./deploy-proxy.sh
``` 