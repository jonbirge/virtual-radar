# Development container for GitHub Codespaces and VS Code Dev Containers
FROM mcr.microsoft.com/devcontainers/javascript-node:20

# Install build dependencies for better-sqlite3
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Create data directory for SQLite database
RUN mkdir -p /workspaces/flight/data && chown node:node /workspaces/flight/data

# Set working directory
WORKDIR /workspaces/flight

# Switch to non-root user
USER node
