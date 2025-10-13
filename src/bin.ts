#!/usr/bin/env node

import { parseArgs } from "node:util"

const args = parseArgs({
  options: {
    version: {
      type: "boolean",
      short: "v",
    },
    help: {
      type: "boolean",
      short: "h",
    },
    "generate-token": {
      type: "boolean",
    },
  },
  allowPositionals: true,
})

if (args.values.version) {
  console.log("linkedin-api-mcp-server version 1.0.0")
  process.exit(0)
}

if (args.values.help) {
  console.log(`
LinkedIn API MCP Server
=======================

A Model Context Protocol (MCP) server for LinkedIn API integration.

Usage:
  npx linkedin-api-mcp-server [options]

Options:
  -h, --help           Show this help message
  -v, --version        Show version number
  --generate-token     Generate a secure OAuth token for HTTP server

Environment Variables:
  LINKEDIN_CLIENT_ID        LinkedIn API client ID (required)
  LINKEDIN_CLIENT_SECRET    LinkedIn API client secret (required)
  LINKEDIN_ACCESS_TOKEN     LinkedIn access token (optional)
  LINKEDIN_REFRESH_TOKEN    LinkedIn refresh token (optional)
  LINKEDIN_REDIRECT_URI     OAuth redirect URI (optional)
  TRANSPORT_TYPE            Transport type: stdio or http (default: http)
  PORT                      HTTP server port (default: 3000)
  HOST                      HTTP server host (default: 0.0.0.0)
  OAUTH_ENABLED             Enable OAuth for HTTP server (default: false)
  OAUTH_TOKEN               OAuth token for HTTP server authentication

Examples:
  # Run as stdio MCP server (for Claude Desktop/Cursor)
  TRANSPORT_TYPE=stdio npx linkedin-api-mcp-server

  # Run as HTTP server
  npx linkedin-api-mcp-server

  # Run with OAuth protection
  OAUTH_ENABLED=true OAUTH_TOKEN=your_token npx linkedin-api-mcp-server

  # Generate OAuth token
  npx linkedin-api-mcp-server --generate-token

For more information, visit:
  https://github.com/jordanburke/linkedin-api-mcp-server
`)
  process.exit(0)
}

if (args.values["generate-token"]) {
  const token = Array.from({ length: 32 }, () =>
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 62)),
  ).join("")
  console.log(`Generated OAuth token: ${token}`)
  console.log(`\nUse this token with:`)
  console.log(`  OAUTH_ENABLED=true OAUTH_TOKEN=${token} npx linkedin-api-mcp-server`)
  process.exit(0)
}

// Default: run the MCP server
process.env.TRANSPORT_TYPE = process.env.TRANSPORT_TYPE || "stdio"
import("./index.js")
