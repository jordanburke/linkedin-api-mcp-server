# LinkedIn API MCP Server ⚙️

A Model Context Protocol (MCP) server that provides comprehensive tools for interacting with the LinkedIn API, including personal profiles, company pages, content management, and analytics.

## ✨ Features

### Personal/Member APIs

- **Profile Management**: Get and search LinkedIn profiles
- **Personal Posts**: Create and manage personal content
- **Analytics**: Track engagement metrics

### Company/Organization APIs (Marketing API)

- **Company Management**: Get and manage company pages
- **Company Posts**: Create, retrieve, and delete company content
- **Company Analytics**: Detailed insights and follower demographics
- **Media Upload**: Upload images and videos for posts

### Dual Transport Support

- **stdio**: For Claude Desktop and Cursor integration
- **HTTP**: For remote access with automatic OAuth authentication

### Seamless OAuth Flow

- **Automatic Authentication**: MCP clients discover OAuth endpoints automatically
- **No Token Copy/Paste**: Browser-based login flow handles token exchange
- **Token Refresh**: Automatic token refresh keeps sessions alive

## 🔧 Available Tools

### Profile Tools

- `test_linkedin_mcp_server` - Test server connection
- `get_my_profile` - Get authenticated user's profile
- `get_profile(person_urn)` - Get profile by URN
- `search_people(keywords, filters)` - Search for people

### Company Tools

- `get_company(organization_urn)` - Get company information
- `search_companies(keywords)` - Search for companies
- `get_my_companies(person_urn)` - Get managed companies

### Content Tools

- `create_company_post(org_urn, text, ...)` - Post as company
- `get_company_posts(org_urn, count)` - Get company posts
- `delete_company_post(share_urn)` - Delete company post

### Analytics Tools

- `get_post_analytics(share_urn)` - Get post statistics
- `get_company_analytics(org_urn)` - Get company metrics
- `get_follower_statistics(org_urn)` - Get follower demographics

## 🔌 Installation

### For Claude Desktop/Cursor (stdio)

```bash
npm install -g linkedin-api-mcp-server
```

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "linkedin": {
      "command": "npx",
      "args": ["linkedin-api-mcp-server"],
      "env": {
        "LINKEDIN_CLIENT_ID": "your_client_id",
        "LINKEDIN_CLIENT_SECRET": "your_client_secret",
        "LINKEDIN_ACCESS_TOKEN": "your_access_token",
        "TRANSPORT_TYPE": "stdio"
      }
    }
  }
}
```

### For HTTP Server (Recommended)

```bash
# Run HTTP server with automatic OAuth flow
LINKEDIN_CLIENT_ID=xxx LINKEDIN_CLIENT_SECRET=yyy npx linkedin-api-mcp-server
```

The server automatically exposes OAuth endpoints:

- `/.well-known/oauth-authorization-server` - OAuth discovery
- `/oauth/register` - Dynamic client registration
- `/oauth/authorize` - Start LinkedIn OAuth flow
- `/oauth/token` - Token exchange
- `/oauth/callback` - LinkedIn callback handler

MCP clients that support OAuth will automatically discover and use these endpoints!

## 🔑 LinkedIn API Setup

### 1. Create LinkedIn App

1. Go to [LinkedIn Developers](https://www.linkedin.com/developers/)
2. Create a new app
3. Note your `Client ID` and `Client Secret`

### 2. Required Scopes

**For Personal APIs:**

- `openid`
- `profile`
- `email`
- `w_member_social`

**For Company APIs (Marketing API):**

- `w_organization_social`
- `rw_organization_admin`
- `r_organization_social`
- `r_analytics`

### 3. Get Access Token

LinkedIn uses OAuth 2.0. You'll need to:

1. Set `LINKEDIN_REDIRECT_URI` (e.g., `http://localhost:3000/callback`)
2. Use the OAuth flow to get an access token
3. Store the `access_token` and `refresh_token`

See [LinkedIn OAuth Documentation](https://learn.microsoft.com/en-us/linkedin/shared/authentication/authentication) for details.

## ⚙️ Configuration

### Minimal Configuration (Just 2 Variables!)

To get started with automatic OAuth, you only need:

```bash
# Required - Get these from LinkedIn Developer Portal
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_client_secret
```

That's it! The OAuth flow handles token exchange automatically.

### OAuth Flow (How It Works)

1. Start the server with just `CLIENT_ID` and `CLIENT_SECRET`
2. MCP client connects and discovers OAuth endpoints
3. User is redirected to LinkedIn to authorize
4. LinkedIn redirects back with authorization code
5. Server exchanges code for tokens automatically
6. Tokens are stored in session and used for API calls

### Optional Configuration

All these have sensible defaults - only override if needed:

```bash
# Server settings (defaults shown)
TRANSPORT_TYPE=http  # or "stdio" for Claude Desktop (note: OAuth requires HTTP)
PORT=3000
HOST=0.0.0.0
BASE_URL=http://localhost:3000  # Public URL for OAuth callbacks

# LinkedIn API scopes (comma-separated, defaults to personal scopes)
# Add company scopes if you have Marketing Developer Platform access
```

### Legacy Mode (Manual Token)

If you prefer manual token management or use stdio transport:

```bash
LINKEDIN_ACCESS_TOKEN=your_access_token
LINKEDIN_REFRESH_TOKEN=your_refresh_token  # Optional, for auto-refresh
```

## 🛠️ Development

### Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm dev                # Build with watch mode
pnpm serve:dev          # Run server in development mode

# Testing
pnpm test               # Run tests
pnpm test:watch         # Run tests in watch mode
pnpm test:coverage      # Run tests with coverage

# Quality
pnpm lint               # Fix linting issues
pnpm format             # Format code
pnpm validate           # Format + Lint + Test + Build

# Production
pnpm build              # Build for production
pnpm start              # Run built server
```

### CLI Options

```bash
# Show help
npx linkedin-api-mcp-server --help

# Show version
npx linkedin-api-mcp-server --version

# Generate OAuth token
npx linkedin-api-mcp-server --generate-token
```

## 📚 Usage Examples

### Search for People

```typescript
// In Claude Desktop or Cursor with MCP
search_people({
  keywords: "software engineer",
  company: "Microsoft",
  count: 10,
})
```

### Create Company Post

```typescript
create_company_post({
  organization_urn: "urn:li:organization:123456",
  text: "Exciting news from our team!",
  visibility: "PUBLIC",
})
```

### Get Company Analytics

```typescript
get_company_analytics({
  organization_urn: "urn:li:organization:123456",
})
```

## 🔐 Marketing API Access

To use company/organization features, you need:

1. **Marketing Developer Platform Partnership**
   - Apply at [LinkedIn Marketing Developer Platform](https://business.linkedin.com/marketing-solutions/marketing-partners)
   - Get approved for organization scopes

2. **Company Admin Access**
   - Be an admin of the LinkedIn company page
   - Have proper permissions for posting and analytics

3. **Elevated Rate Limits**
   - Request higher quotas for analytics APIs

## 📊 Rate Limits

- **Member/Personal**: 150 requests/day
- **Application**: 100,000 requests/day
- **Marketing API**: Higher limits with partnership

The server implements exponential backoff and caching for optimal performance.

## 🐳 Docker Support

### Using Docker Compose (Recommended)

```bash
# Create .env file with your credentials
cp .env.example .env
# Edit .env with your LinkedIn API credentials

# Start the service
docker compose up -d

# View logs
docker compose logs -f

# Stop the service
docker compose down
```

### Using Pre-built Image

```bash
# Pull from GitHub Container Registry
docker pull ghcr.io/jordanburke/linkedin-api-mcp-server:latest

# Run container
docker run -d \
  --name linkedin-mcp \
  -p 3000:3000 \
  --env-file .env \
  ghcr.io/jordanburke/linkedin-api-mcp-server:latest
```

### Building Locally

```bash
# Build Docker image
docker build -t linkedin-mcp-server .

# Run container
docker run -d \
  --name linkedin-mcp \
  -p 3000:3000 \
  -e LINKEDIN_CLIENT_ID=xxx \
  -e LINKEDIN_CLIENT_SECRET=yyy \
  -e LINKEDIN_ACCESS_TOKEN=zzz \
  linkedin-mcp-server

# View logs
docker logs -f linkedin-mcp

# Stop container
docker stop linkedin-mcp
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see LICENSE file for details

## 🔗 Links

- [LinkedIn API Documentation](https://learn.microsoft.com/en-us/linkedin/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [FastMCP Framework](https://github.com/jlowin/fastmcp)

## 🙏 Credits

Built with [FastMCP](https://github.com/jlowin/fastmcp) and inspired by the MCP ecosystem.
