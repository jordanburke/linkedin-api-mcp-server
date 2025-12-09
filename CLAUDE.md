# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Model Context Protocol (MCP) server that provides comprehensive LinkedIn API integration including personal profiles, company pages, content management, and analytics. Built with FastMCP and supports dual transport modes (stdio for Claude Desktop/Cursor, HTTP for remote access).

## Development Commands

### Essential Commands

- `pnpm validate` - **Pre-checkin**: Format, lint, test, and build everything
- `pnpm dev` - Build with watch mode for active development
- `pnpm serve:dev` - Run server with hot reload using tsx

### Testing

- `pnpm test` - Run all tests
- `pnpm test:watch` - Watch mode for TDD
- `pnpm test:coverage` - Generate coverage report

### Server Operation

- `pnpm start` - Build and run production server
- `pnpm serve` - Run built server without rebuild
- `pnpm inspect` - Launch MCP inspector for debugging tools

### CLI Testing

```bash
# Test with environment variables
LINKEDIN_CLIENT_ID=xxx LINKEDIN_CLIENT_SECRET=yyy LINKEDIN_ACCESS_TOKEN=zzz pnpm serve:dev

# Test CLI flags
pnpm build && node dist/bin.js --help
pnpm build && node dist/bin.js --generate-token
```

## Architecture

### Two-Client Design Pattern

The codebase uses a dual-client architecture to separate concerns:

1. **LinkedInClient** (`src/client/linkedin-client.ts`)
   - Personal/Member APIs (profiles, search)
   - OAuth 2.0 flow management with automatic token refresh
   - Profile normalization and data transformation

2. **LinkedInMarketingClient** (`src/client/linkedin-marketing-client.ts`)
   - Company/Organization APIs (Tier 2 Marketing API)
   - Company posts, analytics, media upload
   - Follower demographics and page statistics
   - Requires Marketing Developer Platform partnership

**Key Detail**: Both clients implement singleton pattern via `initialize*()` and `get*()` functions at module level.

### MCP Server Structure

The main server (`src/index.ts`) follows FastMCP patterns:

- **Setup Phase**: `setupLinkedInClients()` initializes both clients and tests authentication
- **Tool Registration**: 13 tools registered with Zod schema validation
- **Transport Selection**: Environment variable `TRANSPORT_TYPE` controls stdio vs HTTP mode
- **Error Handling**: All tools throw descriptive errors; responses use formatted strings

### LinkedIn API Specifics

**Authentication Flow**:

1. Three-legged OAuth 2.0 with authorization code exchange
2. Automatic token refresh before expiry
3. 401 response triggers one retry attempt with refreshed token

**URN Format**: All LinkedIn entities use URN identifiers:

- Person: `urn:li:person:{id}`
- Organization: `urn:li:organization:{id}`
- Share: `urn:li:share:{id}`

**RESTli Protocol**: All requests include:

- `LinkedIn-Version: 202501`
- `X-Restli-Protocol-Version: 2.0.0`

### Type System Architecture

Types in `src/types.ts` are organized by domain:

- **Client Config**: OAuth and API configuration
- **Entities**: Profile, Organization, Post with full/partial variants
- **Requests**: Search, Create, Upload with Zod-compatible structure
- **Analytics**: Statistics, Demographics with nested structures
- **Formatted**: Display-ready types for MCP tool responses

**Important**: Formatters (`src/utils/formatters.ts`) convert API responses to user-friendly markdown strings. All MCP tools return formatted strings, not raw objects.

### Buffer Handling Pattern

When working with file uploads (`uploadMedia` method):

```typescript
// Convert Buffer or ArrayBuffer to Uint8Array for fetch compatibility
const body = fileBuffer instanceof Buffer ? new Uint8Array(fileBuffer) : new Uint8Array(fileBuffer)
```

This pattern avoids TypeScript errors with fetch's BodyInit type that doesn't accept Node's Buffer directly.

### Build System

- **tsup**: Builds CJS, ESM, and DTS simultaneously
- **Environment-based output**: Production → `dist/`, Development → `lib/`
- **Entry points**: All `src/**/*.ts` files for proper chunking
- **CLI binary**: `src/bin.ts` → `dist/bin.js` with shebang

## LinkedIn API Requirements

### Required OAuth Scopes

**Personal APIs**:

- `openid`, `profile`, `email`, `w_member_social`

**Company APIs** (requires partnership):

- `w_organization_social`, `rw_organization_admin`, `r_organization_social`, `r_analytics`

### Rate Limits

- Member/Personal: 150 requests/day
- Application: 100,000 requests/day
- Marketing API: Higher limits with partnership approval

### Environment Variables

**Required**:

- `LINKEDIN_CLIENT_ID`
- `LINKEDIN_CLIENT_SECRET`

**Server Config**:

- `TRANSPORT_TYPE`: `stdio` (Claude Desktop/Cursor) or `http` (default)
- `PORT`: HTTP server port (default: 3000)
- `HOST`: Bind address (default: 0.0.0.0)
- `BASE_URL`: Public URL for OAuth callbacks (default: `http://localhost:PORT`)

**Legacy/Manual Token Mode** (optional, if not using automatic OAuth):

- `LINKEDIN_ACCESS_TOKEN` (obtained via OAuth flow)
- `LINKEDIN_REFRESH_TOKEN` (for automatic refresh)

### OAuth Flow

The server uses FastMCP's OAuth Proxy to handle LinkedIn authentication automatically:

1. MCP client connects and discovers `/.well-known/oauth-authorization-server`
2. Client uses discovered endpoints to initiate OAuth flow
3. User authenticates with LinkedIn in browser
4. Server exchanges code for tokens via `/oauth/callback`
5. FastMCP issues short-lived JWTs that map to LinkedIn tokens
6. Tools access LinkedIn tokens via `context.session`

## Testing Strategy

- Tests use Vitest with Node.js environment
- Focus on formatters and type transformations (API calls are mocked in tests)
- No integration tests with real LinkedIn API (requires live credentials)

## Common Patterns

### Adding a New MCP Tool

1. Define parameter schema with Zod in `src/index.ts`
2. Get appropriate client: `getLinkedInClient()` or `getMarketingClient()`
3. Call client method and handle errors
4. Format response using utilities from `src/utils/formatters.ts`
5. Return formatted string for user display

### Handling Unknown API Responses

LinkedIn API responses vary by endpoint. Use this pattern:

```typescript
private normalizeEntity(data: unknown): EntityType {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = data as any
  return {
    id: d.id || "",
    field: d.field?.nested?.value || d.alternateField || ""
  }
}
```

### Transport Mode Considerations

- **stdio mode**: Single request/response, no persistent connection
- **HTTP mode**: Supports SSE streaming at `/sse` endpoint
- Authentication check runs at startup for both modes
