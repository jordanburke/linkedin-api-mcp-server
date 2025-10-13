# OAuth Login Flow Implementation Guide

**Status**: 📋 Planned for future implementation
**Priority**: Enhancement
**Complexity**: Medium

## Problem Statement

Currently, users must obtain LinkedIn OAuth tokens manually outside the MCP server:

1. Visit LinkedIn Developer Portal
2. Complete OAuth flow in browser
3. Copy access_token and refresh_token
4. Paste into .env file
5. Start Docker container

This is cumbersome and not intuitive for users expecting a "login" experience.

## Proposed Solution: Hybrid Server Architecture

Add OAuth login capability by running Express/Hono alongside FastMCP to handle OAuth callbacks while keeping MCP tools available.

## Architecture

### Current Architecture

```
FastMCP Server (port 3000)
├── /mcp (MCP endpoint)
├── /sse (SSE endpoint)
└── Tools require pre-configured tokens
```

### Proposed Architecture

```
Combined Server (port 3000)
├── Express/Hono Web Server
│   ├── GET /oauth/start → Redirect to LinkedIn
│   ├── GET /oauth/callback → Handle LinkedIn redirect
│   ├── GET /oauth/status → Check auth status
│   └── GET / → Landing page with "Login with LinkedIn" button
│
└── FastMCP (mounted on same server)
    ├── /mcp (MCP endpoint)
    ├── /sse (SSE endpoint)
    └── Tools use tokens from OAuth flow
```

## Implementation Steps

### 1. Add Dependencies

```bash
pnpm add express @types/express
# OR
pnpm add hono
```

### 2. Create OAuth Flow Module

Create `src/oauth/oauth-server.ts`:

```typescript
import express from "express"
import { getLinkedInClient, initializeLinkedInClient } from "../client/linkedin-client"

let storedTokens: {
  accessToken: string
  refreshToken: string
  expiresAt: number
} | null = null

export function createOAuthServer() {
  const app = express()

  // Landing page with login button
  app.get("/", (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>LinkedIn MCP Server</title></head>
        <body>
          <h1>LinkedIn MCP Server</h1>
          <p>Status: ${storedTokens ? "✓ Authenticated" : "✗ Not authenticated"}</p>
          ${!storedTokens ? '<a href="/oauth/start"><button>Login with LinkedIn</button></a>' : ""}
          <p><a href="/oauth/status">Check Status</a></p>
        </body>
      </html>
    `)
  })

  // Start OAuth flow
  app.get("/oauth/start", (req, res) => {
    const client = getLinkedInClient()
    if (!client) {
      return res.status(500).send("LinkedIn client not initialized")
    }

    const scopes = [
      "openid",
      "profile",
      "email",
      "w_member_social",
      "w_organization_social",
      "rw_organization_admin",
      "r_organization_social",
      "r_analytics",
    ]

    const state = crypto.randomUUID() // CSRF protection
    const authUrl = client.getAuthorizationUrl(scopes, state)

    // Store state in session/memory for validation
    res.redirect(authUrl)
  })

  // OAuth callback
  app.get("/oauth/callback", async (req, res) => {
    const { code, error } = req.query

    if (error) {
      return res.status(400).send(`OAuth error: ${error}`)
    }

    if (!code || typeof code !== "string") {
      return res.status(400).send("Missing authorization code")
    }

    try {
      const client = getLinkedInClient()
      if (!client) {
        return res.status(500).send("LinkedIn client not initialized")
      }

      // Exchange code for tokens
      const tokenResponse = await client.exchangeCodeForToken(code)

      // Store tokens
      storedTokens = {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || "",
        expiresAt: Date.now() + tokenResponse.expires_in * 1000,
      }

      // Save to file for persistence
      await saveTokensToFile(storedTokens)

      // Reinitialize clients with new tokens
      initializeLinkedInClient({
        clientId: process.env.LINKEDIN_CLIENT_ID!,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET!,
        accessToken: storedTokens.accessToken,
        refreshToken: storedTokens.refreshToken,
        redirectUri: process.env.LINKEDIN_REDIRECT_URI,
      })

      res.send(`
        <!DOCTYPE html>
        <html>
          <head><title>LinkedIn Authentication Success</title></head>
          <body>
            <h1>✓ Authentication Successful!</h1>
            <p>Your LinkedIn account is now connected.</p>
            <p>The MCP server is ready to use.</p>
            <p><a href="/">Back to Home</a></p>
          </body>
        </html>
      `)
    } catch (error) {
      console.error("OAuth callback error:", error)
      res.status(500).send(`Failed to complete authentication: ${error}`)
    }
  })

  // Check auth status (JSON API for MCP tools)
  app.get("/oauth/status", (req, res) => {
    res.json({
      authenticated: !!storedTokens,
      expiresAt: storedTokens?.expiresAt,
      hasRefreshToken: !!storedTokens?.refreshToken,
    })
  })

  return app
}

export function getStoredTokens() {
  return storedTokens
}

// Token persistence
async function saveTokensToFile(tokens: typeof storedTokens) {
  const fs = await import("fs/promises")
  const path = await import("path")

  const tokenFile = path.join(process.cwd(), ".oauth-tokens.json")
  await fs.writeFile(tokenFile, JSON.stringify(tokens, null, 2))
}

async function loadTokensFromFile() {
  try {
    const fs = await import("fs/promises")
    const path = await import("path")

    const tokenFile = path.join(process.cwd(), ".oauth-tokens.json")
    const data = await fs.readFile(tokenFile, "utf-8")
    storedTokens = JSON.parse(data)

    // Check if tokens are still valid
    if (storedTokens && storedTokens.expiresAt < Date.now()) {
      console.log("[OAuth] Stored tokens expired, will need re-authentication")
    }
  } catch (error) {
    // File doesn't exist or invalid JSON - that's okay
    console.log("[OAuth] No stored tokens found")
  }
}

// Initialize on module load
loadTokensFromFile()
```

### 3. Integrate with Main Server

Update `src/index.ts`:

```typescript
import { createOAuthServer } from "./oauth/oauth-server"

async function main() {
  try {
    await setupLinkedInClients()

    const useStdio = process.env.TRANSPORT_TYPE === "stdio"

    if (useStdio) {
      // stdio mode - no OAuth
      await server.start({ transportType: "stdio" })
    } else {
      // HTTP mode - add OAuth routes
      const port = parseInt(process.env.PORT || "3000")
      const host = process.env.HOST || "0.0.0.0"

      // Create combined server
      const oauthApp = createOAuthServer()

      // Start OAuth server
      const httpServer = oauthApp.listen(port, host, () => {
        console.error(`[Setup] OAuth server on http://${host}:${port}`)
        console.error(`[Setup] Visit http://localhost:${port}/oauth/start to authenticate`)
      })

      // Mount FastMCP on same server (if FastMCP supports this)
      // OR run FastMCP on different port and use nginx to proxy
      // This requires investigation of FastMCP internals
    }
  } catch (error) {
    console.error("[Error] Failed to start server:", error)
    process.exit(1)
  }
}
```

### 4. Add MCP Tool for Auth Status

```typescript
server.addTool({
  name: "check_linkedin_auth",
  description: "Check LinkedIn authentication status and get login instructions",
  parameters: z.object({}),
  execute: async () => {
    const tokens = getStoredTokens()

    if (!tokens) {
      return `
# LinkedIn Authentication Required

You are not authenticated with LinkedIn.

## To authenticate:
1. Visit: http://localhost:3000/oauth/start
2. Log in to LinkedIn and grant permissions
3. You'll be redirected back and authentication will complete

After authentication, all LinkedIn MCP tools will work automatically.
`
    }

    const expiresIn = Math.floor((tokens.expiresAt - Date.now()) / 1000 / 60)

    return `
# LinkedIn Authentication Status

✓ **Authenticated**

- Access token expires in: ${expiresIn} minutes
- Refresh token: ${tokens.refreshToken ? "✓ Available" : "✗ Not available"}
- Auto-refresh: ${tokens.refreshToken ? "Enabled" : "Disabled"}

Your LinkedIn MCP tools are ready to use!
`
  },
})
```

### 5. Update Environment Variables

Update `.env.example`:

```bash
# ===== REQUIRED =====
LINKEDIN_CLIENT_ID=your_client_id_here
LINKEDIN_CLIENT_SECRET=your_client_secret_here

# ===== OAUTH CONFIGURATION =====
# Redirect URI for OAuth flow (must match LinkedIn app settings)
LINKEDIN_REDIRECT_URI=http://localhost:3000/oauth/callback

# ===== OPTIONAL - Manual Token Configuration =====
# If you prefer to use manually obtained tokens instead of OAuth flow:
# LINKEDIN_ACCESS_TOKEN=
# LINKEDIN_REFRESH_TOKEN=

# ===== SERVER CONFIGURATION =====
TRANSPORT_TYPE=http
PORT=3000
HOST=0.0.0.0
```

### 6. Update Docker Configuration

Update `docker-compose.yml`:

```yaml
services:
  linkedin-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - LINKEDIN_CLIENT_ID=${LINKEDIN_CLIENT_ID}
      - LINKEDIN_CLIENT_SECRET=${LINKEDIN_CLIENT_SECRET}
      - LINKEDIN_REDIRECT_URI=http://localhost:3000/oauth/callback
      # Optional: Pre-configured tokens (skips OAuth flow)
      # - LINKEDIN_ACCESS_TOKEN=${LINKEDIN_ACCESS_TOKEN}
      # - LINKEDIN_REFRESH_TOKEN=${LINKEDIN_REFRESH_TOKEN}
    volumes:
      # Mount volume to persist OAuth tokens across restarts
      - ./data:/app/data
    restart: unless-stopped
```

### 7. Update .gitignore

```gitignore
# OAuth tokens (never commit these!)
.oauth-tokens.json
data/
```

### 8. Update Documentation

Update README.md with new authentication flow:

````markdown
## Authentication

### Option 1: OAuth Login Flow (Recommended)

1. Start the server:
   ```bash
   docker compose up -d
   ```
````

2. Visit http://localhost:3000/oauth/start

3. Log in to LinkedIn and grant permissions

4. Done! Tokens are stored and automatically refreshed

### Option 2: Manual Token Configuration

If you prefer to manage tokens manually:

1. Get tokens from LinkedIn Developer Portal
2. Add to .env file:
   ```bash
   LINKEDIN_ACCESS_TOKEN=your_token
   LINKEDIN_REFRESH_TOKEN=your_refresh_token
   ```
3. Start server

````

## Benefits

### User Experience
- ✅ **No manual token copying**: Click "Login with LinkedIn" button
- ✅ **Browser-based login**: Familiar OAuth flow
- ✅ **Automatic token storage**: Persists across restarts
- ✅ **Automatic token refresh**: Never expires (until refresh token expires)
- ✅ **Works in Docker**: Port 3000 exposed for both OAuth and MCP

### Developer Experience
- ✅ **Easier onboarding**: No need to explain manual token extraction
- ✅ **Better security**: Tokens never in .env or logs
- ✅ **Fallback option**: Manual tokens still supported

## Challenges & Considerations

### 1. FastMCP Integration
**Challenge**: FastMCP provides HTTP streaming for MCP, but doesn't expose the underlying HTTP server for custom routes.

**Solutions**:
- **Option A**: Run Express on same port, mount FastMCP on it (requires FastMCP internal access)
- **Option B**: Run FastMCP on port 3001, Express on 3000, use nginx/proxy
- **Option C**: Use FastMCP's `authenticate` hook and separate OAuth server

### 2. Token Persistence
**Challenge**: Docker containers are ephemeral.

**Solutions**:
- **Option A**: Volume mount for `.oauth-tokens.json`
- **Option B**: Environment variable injection after OAuth
- **Option C**: Database (overkill)

### 3. Redirect URI Configuration
**Challenge**: `http://localhost:3000/oauth/callback` only works locally.

**Solutions**:
- **Development**: Use localhost
- **Production**: Use public URL (https://your-domain.com/oauth/callback)
- **Docker**: Use host network or expose ports properly

### 4. Security Considerations
- ✅ Implement CSRF protection with `state` parameter
- ✅ Use PKCE for additional security (LinkedIn supports it)
- ✅ Validate state parameter in callback
- ✅ Use HTTPS in production
- ✅ Never log or expose tokens
- ✅ Add `.oauth-tokens.json` to .gitignore

### 5. Multi-User Support
**Current scope**: Single-user authentication (first user to log in)

**Future enhancement**: Could add:
- User session management
- Multiple LinkedIn accounts
- Per-user token storage
- Role-based access control

## Testing Plan

1. **Local Development**:
   ```bash
   pnpm serve:dev
   # Visit http://localhost:3000/oauth/start
````

2. **Docker Testing**:

   ```bash
   docker compose up -d
   docker compose logs -f
   # Visit http://localhost:3000/oauth/start
   ```

3. **MCP Tool Testing**:
   ```bash
   # After OAuth login
   curl http://localhost:3000/mcp -X POST -d '{"method":"tools/call","params":{"name":"check_linkedin_auth"}}'
   ```

## Implementation Checklist

- [ ] Add Express/Hono dependency
- [ ] Create `src/oauth/oauth-server.ts`
- [ ] Implement OAuth routes (start, callback, status)
- [ ] Add token persistence (file-based)
- [ ] Integrate with main server
- [ ] Add MCP tool for auth status
- [ ] Update environment variables
- [ ] Update Docker configuration with volumes
- [ ] Add .gitignore entries
- [ ] Update README documentation
- [ ] Add security: CSRF protection (state param)
- [ ] Add security: PKCE (if LinkedIn supports)
- [ ] Test local development flow
- [ ] Test Docker deployment flow
- [ ] Write integration tests
- [ ] Update CLAUDE.md with OAuth architecture

## Alternative: Keep Current Approach

If OAuth flow proves too complex, alternative is to improve current documentation:

### Enhanced Manual Token Documentation

Create `docs/getting-tokens.md` with:

- Screenshots of LinkedIn Developer Portal
- Step-by-step token extraction guide
- Video walkthrough
- Troubleshooting common issues
- Token expiration FAQ

This is simpler but less user-friendly.

## Decision

**Recommendation**: Implement OAuth flow for better UX, but keep manual token support as fallback.

**Timeline**:

- Phase 1: Document current manual approach clearly (✅ Done)
- Phase 2: Implement OAuth flow (📋 Planned)
- Phase 3: Add multi-user support (🔮 Future)

## References

- [LinkedIn OAuth 2.0 Documentation](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication)
- [FastMCP Documentation](https://github.com/punkpeye/fastmcp)
- [MCP Authorization Specification](https://modelcontextprotocol.io/specification/draft/basic/authorization)
- [OAuth 2.0 PKCE](https://oauth.net/2/pkce/)
