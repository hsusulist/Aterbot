# Overview

Aterbot is a 24/7 Minecraft AFK (Away From Keyboard) bot designed to maintain a persistent presence on a Minecraft server. The bot automatically connects to a specified server, handles authentication through the AuthMe plugin, and keeps the connection alive to prevent idle disconnections. It includes a simple web server for status monitoring and automatic reconnection capabilities for maintaining uptime.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Core Bot Architecture
- **Event-driven design**: Built on the Mineflayer library using Node.js event system for handling Minecraft protocol events
- **Automatic reconnection**: Implements retry logic with configurable delays to handle network interruptions and server restarts
- **Authentication integration**: Supports AuthMe plugin with automatic login/registration commands sent after spawning

## Configuration Management
- **JSON-based configuration**: Centralized config.json file containing server connection details, credentials, and bot behavior settings
- **Runtime configuration**: Supports both registered and unregistered user flows with password-based authentication

## Web Interface
- **Health check endpoint**: Simple HTTP server that provides bot status confirmation for monitoring and deployment platforms
- **CORS-enabled**: Configured for cross-origin requests to support external monitoring tools
- **Environment-aware**: Uses PORT environment variable for deployment flexibility (defaults to 5000)

## Development Environment
- **TypeScript implementation**: Type-safe development with ES2022 target and NodeNext module resolution
- **Build pipeline**: Compiles TypeScript to JavaScript and copies configuration files to distribution directory
- **Development tools**: Hot reloading support through tsx for rapid development cycles

## Error Handling and Resilience
- **Graceful disconnection**: Proper cleanup of intervals and bot connections during shutdown
- **Error recovery**: Automatic reconnection on connection errors, kicks, or unexpected disconnections
- **Configurable retry logic**: Adjustable retry delays and timeout settings through configuration

# External Dependencies

## Primary Dependencies
- **Mineflayer**: Minecraft bot framework for protocol handling and game interactions
- **Node.js HTTP module**: Built-in web server for status endpoint

## Development Dependencies
- **TypeScript**: Static typing and modern JavaScript features
- **tsx**: TypeScript execution for development workflow
- **@types/node**: Node.js type definitions

## Server Integration
- **Minecraft server**: Connects to specified host and port (configured for Aternos hosting)
- **AuthMe plugin**: Handles user registration and authentication on the target server