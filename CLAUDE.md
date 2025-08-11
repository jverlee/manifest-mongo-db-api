# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a standalone MongoDB API server that provides CRUD operations for documents across multiple applications. The server uses a multi-tenancy architecture where each `appId` corresponds to a separate MongoDB database.

## Key Architecture Components

- **Multi-tenant Design**: Each `appId` parameter routes to a separate MongoDB database
- **Authentication**: Google OAuth via Passport.js with session management
- **Access Control**: App-based validation through Supabase configuration
- **Database**: MongoDB with per-app database isolation
- **Session Storage**: MongoDB-backed sessions via connect-mongo

## Development Commands

```bash
# Start the server in development mode with hot reload
npm run dev

# Start the server in production mode
npm start
```

Note: No test scripts or linting tools are configured in package.json.

## Core API Structure

All API endpoints follow the pattern: `/:appId/entities/:collection`

- **appId**: Database identifier (each app gets its own MongoDB database)
- **collection**: Collection name within that database
- **Authentication**: Protected endpoints use `validateAccess` middleware
- **Config**: App configuration retrieved from Supabase via `/:appId/config`

## Key Services

- **entityService.js**: Core CRUD operations with MongoDB
- **supabaseService.js**: Handles app configuration and project settings
- **authMiddleware.js**: Validates app access based on monetization settings
- **databaseMiddleware.js**: Ensures MongoDB connectivity

## Database Connection

The app uses a single MongoDB connection client but creates separate databases per appId:
- Connection string: `MONGODB_URI` environment variable  
- Database naming: Each `appId` becomes a MongoDB database name
- Collections: Automatically created and accessed via `getCollection(appId, collectionName)`

## Authentication Flow

1. Google OAuth configured in `config/passport.js`
2. Sessions stored in MongoDB `sessions` database
3. Access validated per app via `validateAccess` middleware
4. App configs (including monetization rules) fetched from Supabase

## Environment Variables Required

- `MONGODB_URI`: MongoDB connection string
- `SESSION_SECRET`: Session encryption key
- `NODE_ENV`: Environment (affects CORS and session settings)
- Supabase configuration for app configs
- Google OAuth credentials for authentication