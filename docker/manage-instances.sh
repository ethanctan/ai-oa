#!/bin/bash
set -e

NETWORK_NAME="ai-oa-network"

show_help() {
    echo "AI OA Multi-Tenant Instance Manager"
    echo ""
    echo "Usage: $0 <command> [options]"
    echo ""
    echo "Commands:"
    echo "  list          List all running instance containers"
    echo "  stop <id>     Stop a specific instance container"
    echo "  cleanup       Remove stopped containers and unused images"
    echo "  network       Show network information"
    echo "  logs <id>     Show logs for a specific instance"
    echo "  restart <id>  Restart a specific instance"
    echo ""
    echo "Examples:"
    echo "  $0 list"
    echo "  $0 stop 123"
    echo "  $0 logs 123"
    echo "  $0 cleanup"
}

list_instances() {
    echo "🔍 Listing instance containers..."
    echo ""
    docker ps --filter "name=instance-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}\t{{.CreatedAt}}"
}

stop_instance() {
    local instance_id=$1
    if [ -z "$instance_id" ]; then
        echo "Error: Instance ID required"
        echo "Usage: $0 stop <instance_id>"
        exit 1
    fi
    
    local container_name="instance-${instance_id}"
    echo "🛑 Stopping instance container: $container_name"
    
    if docker stop "$container_name" 2>/dev/null; then
        echo "Instance $instance_id stopped successfully"
        echo "🗑️  Removing container..."
        docker rm "$container_name" 2>/dev/null || echo "⚠️  Container already removed"
    else
        echo "Failed to stop instance $instance_id (container may not exist)"
    fi
}

show_logs() {
    local instance_id=$1
    if [ -z "$instance_id" ]; then
        echo "Error: Instance ID required"
        echo "Usage: $0 logs <instance_id>"
        exit 1
    fi
    
    local container_name="instance-${instance_id}"
    echo "Showing logs for instance: $container_name"
    echo ""
    docker logs "$container_name" --tail 50 -f
}

restart_instance() {
    local instance_id=$1
    if [ -z "$instance_id" ]; then
        echo "Error: Instance ID required"
        echo "Usage: $0 restart <instance_id>"
        exit 1
    fi
    
    local container_name="instance-${instance_id}"
    echo "Restarting instance container: $container_name"
    
    if docker restart "$container_name" 2>/dev/null; then
        echo "Instance $instance_id restarted successfully"
    else
        echo "Failed to restart instance $instance_id (container may not exist)"
    fi
}

cleanup() {
    echo "🧹 Cleaning up stopped containers and unused images..."
    
    # Remove stopped instance containers
    echo "Removing stopped instance containers..."
    docker container prune -f --filter "label=type=ai-oa-instance" || true
    
    # Remove unused images
    echo "Removing unused images..."
    docker image prune -f || true
    
    # Show current state
    echo ""
    echo "Current instance containers:"
    list_instances
}

show_network() {
    echo "🌐 Network information for $NETWORK_NAME:"
    echo ""
    if docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
        docker network inspect "$NETWORK_NAME" --format "{{json .}}" | jq '.Containers // {}' 2>/dev/null || docker network inspect "$NETWORK_NAME"
    else
        echo "Network $NETWORK_NAME not found"
        echo "Run: docker/deploy-proxy.sh to create the network and proxy"
    fi
}

# Main command handling
case "${1:-help}" in
    "list")
        list_instances
        ;;
    "stop")
        stop_instance "$2"
        ;;
    "logs")
        show_logs "$2"
        ;;
    "restart")
        restart_instance "$2"
        ;;
    "cleanup")
        cleanup
        ;;
    "network")
        show_network
        ;;
    "help"|*)
        show_help
        ;;
esac 