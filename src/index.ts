import crypto from "crypto"
import dotenv from "dotenv"
import { FastMCP } from "fastmcp"
import http from "http"
import { z } from "zod"

import { LinkedInClient } from "./client/linkedin-client"
import { LinkedInMarketingClient } from "./client/linkedin-marketing-client"
import type { LinkedInSession } from "./types"
import {
  formatOrganizationDetailed,
  formatPostDetailed,
  formatProfileDetailed,
  formatShareStatistics,
} from "./utils/formatters"

// Load environment variables
dotenv.config()

// LinkedIn OAuth endpoints
const LINKEDIN_AUTH_ENDPOINT = "https://www.linkedin.com/oauth/v2/authorization"
const LINKEDIN_TOKEN_ENDPOINT = "https://www.linkedin.com/oauth/v2/accessToken"

// LinkedIn OAuth scopes
const LINKEDIN_SCOPES = ["openid", "profile", "email", "w_member_social"]

// Get configuration from environment
const clientId = process.env.LINKEDIN_CLIENT_ID
const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
const serverPort = parseInt(process.env.PORT || "3000")
const serverHost = process.env.HOST || "localhost"
const baseUrl = process.env.BASE_URL || `http://${serverHost}:${serverPort}`
const mcpPort = serverPort + 1
const mcpUrl = `http://${serverHost}:${mcpPort}`
const userAgent = process.env.LINKEDIN_USER_AGENT || "LinkedInMCPServer/1.0.0"

// Validate required credentials
if (!clientId || !clientSecret) {
  console.error("[Error] Missing required LinkedIn API credentials.")
  process.exit(1)
}

// ========== JWT Utilities ==========
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString("hex")

function createJWT(payload: Record<string, unknown>, expiresIn: number = 3600): string {
  const header = { alg: "HS256", typ: "JWT" }
  const now = Math.floor(Date.now() / 1000)
  const fullPayload = {
    ...payload,
    iat: now,
    exp: now + expiresIn,
    jti: crypto.randomBytes(16).toString("hex"),
  }

  const encode = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString("base64url")
  const headerB64 = encode(header)
  const payloadB64 = encode(fullPayload)
  const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest("base64url")

  return `${headerB64}.${payloadB64}.${signature}`
}

function verifyJWT(token: string): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const [headerB64, payloadB64, signature] = token.split(".")
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${headerB64}.${payloadB64}`).digest("base64url")

    if (signature !== expectedSig) return { valid: false }

    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString())
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return { valid: false }

    return { valid: true, payload }
  } catch {
    return { valid: false }
  }
}

// ========== OAuth State Management ==========
type OAuthTransaction = {
  clientId: string
  redirectUri: string
  state: string
  codeChallenge?: string
  codeChallengeMethod?: string
  scope: string[]
  createdAt: number
}

type AuthCode = {
  clientId: string
  redirectUri: string
  linkedInTokens: LinkedInSession
  createdAt: number
  used: boolean
}

const transactions = new Map<string, OAuthTransaction>()
const authCodes = new Map<string, AuthCode>()
const registeredClients = new Map<string, { redirectUris: string[]; createdAt: number }>()
const tokenStore = new Map<string, { linkedInTokens: LinkedInSession; createdAt: number }>()

// Cleanup expired items
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of transactions.entries()) if (now - v.createdAt > 600000) transactions.delete(k)
  for (const [k, v] of authCodes.entries()) if (now - v.createdAt > 300000) authCodes.delete(k)
  for (const [k, v] of tokenStore.entries()) if (now - v.createdAt > 3600000) tokenStore.delete(k)
}, 60000)

// ========== LinkedIn Token Exchange (No PKCE) ==========
async function exchangeLinkedInCode(code: string, redirectUri: string): Promise<LinkedInSession> {
  console.error("[OAuth] Exchanging LinkedIn authorization code...")

  const params = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
    client_id: clientId!,
    client_secret: clientSecret!,
  })

  const response = await fetch(LINKEDIN_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })

  if (!response.ok) {
    const error = await response.json()
    console.error("[OAuth] LinkedIn token exchange failed:", error)
    throw new Error(error.error_description || error.error || "Token exchange failed")
  }

  const tokens = (await response.json()) as {
    access_token: string
    expires_in: number
    refresh_token?: string
    scope?: string
  }

  console.error("[OAuth] LinkedIn token exchange successful")

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
    scope: tokens.scope?.split(" "),
  }
}

// ========== OAuth HTTP Server ==========
function createOAuthMCPServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url || "/", baseUrl)
    const method = req.method || "GET"

    // Helper to send JSON response
    const json = (data: unknown, status = 200) => {
      res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" })
      res.end(JSON.stringify(data))
    }

    // Helper to read POST body
    const readBody = (): Promise<string> =>
      new Promise((resolve) => {
        let body = ""
        req.on("data", (chunk) => (body += chunk))
        req.on("end", () => resolve(body))
      })

    // CORS preflight
    if (method === "OPTIONS") {
      res.writeHead(204, {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      })
      res.end()
      return
    }

    // ===== OAuth Discovery =====
    if (url.pathname === "/.well-known/oauth-authorization-server") {
      return json({
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/oauth/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256", "plain"],
        scopes_supported: LINKEDIN_SCOPES,
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
      })
    }

    // ===== Dynamic Client Registration (RFC 7591) =====
    if (url.pathname === "/oauth/register" && method === "POST") {
      const body = JSON.parse(await readBody())
      const clientId = crypto.randomBytes(16).toString("hex")

      registeredClients.set(clientId, {
        redirectUris: body.redirect_uris || [],
        createdAt: Date.now(),
      })

      console.error(`[OAuth] Registered client: ${clientId}`)

      return json({
        client_id: clientId,
        client_secret: clientId, // Use same as client_id for simplicity
        client_id_issued_at: Math.floor(Date.now() / 1000),
        client_secret_expires_at: 0,
        redirect_uris: body.redirect_uris,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "client_secret_post",
      })
    }

    // ===== Authorization Endpoint =====
    if (url.pathname === "/oauth/authorize") {
      const clientId = url.searchParams.get("client_id")
      const redirectUri = url.searchParams.get("redirect_uri")
      const responseType = url.searchParams.get("response_type")
      const state = url.searchParams.get("state") || crypto.randomBytes(16).toString("hex")
      const scope = url.searchParams.get("scope")
      const codeChallenge = url.searchParams.get("code_challenge")
      const codeChallengeMethod = url.searchParams.get("code_challenge_method")

      if (!clientId || !redirectUri || responseType !== "code") {
        return json({ error: "invalid_request", error_description: "Missing required parameters" }, 400)
      }

      // Create transaction
      const txnId = crypto.randomBytes(32).toString("base64url")
      transactions.set(txnId, {
        clientId,
        redirectUri,
        state,
        codeChallenge: codeChallenge || undefined,
        codeChallengeMethod: codeChallengeMethod || undefined,
        scope: scope?.split(" ") || LINKEDIN_SCOPES,
        createdAt: Date.now(),
      })

      // Redirect to LinkedIn (without PKCE)
      const linkedInAuthUrl = new URL(LINKEDIN_AUTH_ENDPOINT)
      linkedInAuthUrl.searchParams.set("response_type", "code")
      linkedInAuthUrl.searchParams.set("client_id", process.env.LINKEDIN_CLIENT_ID!)
      linkedInAuthUrl.searchParams.set("redirect_uri", `${baseUrl}/oauth/callback`)
      linkedInAuthUrl.searchParams.set("state", txnId)
      linkedInAuthUrl.searchParams.set("scope", LINKEDIN_SCOPES.join(" "))

      console.error(`[OAuth] Redirecting to LinkedIn (transaction: ${txnId.slice(0, 8)}...)`)

      res.writeHead(302, { Location: linkedInAuthUrl.toString() })
      res.end()
      return
    }

    // ===== LinkedIn Callback =====
    if (url.pathname === "/oauth/callback") {
      const code = url.searchParams.get("code")
      const txnId = url.searchParams.get("state")
      const error = url.searchParams.get("error")
      const errorDesc = url.searchParams.get("error_description")

      if (error) {
        console.error(`[OAuth] LinkedIn error: ${error} - ${errorDesc}`)
        return json({ error, error_description: errorDesc }, 400)
      }

      if (!code || !txnId) {
        return json({ error: "invalid_request", error_description: "Missing code or state" }, 400)
      }

      const txn = transactions.get(txnId)
      if (!txn) {
        return json({ error: "invalid_request", error_description: "Invalid or expired state" }, 400)
      }

      try {
        // Exchange code with LinkedIn (no PKCE!)
        const linkedInTokens = await exchangeLinkedInCode(code, `${baseUrl}/oauth/callback`)

        // Generate our own authorization code
        const ourCode = crypto.randomBytes(32).toString("base64url")
        authCodes.set(ourCode, {
          clientId: txn.clientId,
          redirectUri: txn.redirectUri,
          linkedInTokens,
          createdAt: Date.now(),
          used: false,
        })

        // Clean up transaction
        transactions.delete(txnId)

        // Redirect back to MCP client with our code
        const clientRedirect = new URL(txn.redirectUri)
        clientRedirect.searchParams.set("code", ourCode)
        clientRedirect.searchParams.set("state", txn.state)

        console.error(`[OAuth] Success! Redirecting to MCP client...`)

        res.writeHead(302, { Location: clientRedirect.toString() })
        res.end()
      } catch (err) {
        console.error("[OAuth] Token exchange failed:", err)

        const clientRedirect = new URL(txn.redirectUri)
        clientRedirect.searchParams.set("error", "server_error")
        clientRedirect.searchParams.set("error_description", String(err))
        clientRedirect.searchParams.set("state", txn.state)

        res.writeHead(302, { Location: clientRedirect.toString() })
        res.end()
      }
      return
    }

    // ===== Token Endpoint =====
    if (url.pathname === "/oauth/token" && method === "POST") {
      const body = await readBody()
      const params = new URLSearchParams(body)

      const grantType = params.get("grant_type")
      const code = params.get("code")
      const redirectUri = params.get("redirect_uri")
      const codeVerifier = params.get("code_verifier")

      if (grantType === "authorization_code") {
        if (!code) {
          return json({ error: "invalid_request", error_description: "Missing code" }, 400)
        }

        const authCode = authCodes.get(code)
        if (!authCode) {
          return json({ error: "invalid_grant", error_description: "Invalid or expired code" }, 400)
        }

        if (authCode.used) {
          return json({ error: "invalid_grant", error_description: "Code already used" }, 400)
        }

        // Mark as used
        authCode.used = true
        authCodes.set(code, authCode)

        // Generate JWT access token
        const jti = crypto.randomBytes(16).toString("hex")
        const accessToken = createJWT({ sub: jti, scope: LINKEDIN_SCOPES.join(" ") }, 3600)

        // Store mapping from JWT to LinkedIn tokens
        tokenStore.set(jti, { linkedInTokens: authCode.linkedInTokens, createdAt: Date.now() })

        console.error(`[OAuth] Issued access token for MCP client`)

        return json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 3600,
          scope: LINKEDIN_SCOPES.join(" "),
        })
      }

      return json({ error: "unsupported_grant_type" }, 400)
    }

    // ===== Health Check =====
    if (url.pathname === "/health") {
      return json({ status: "ok", oauth: "ready" })
    }

    // ===== Pass through to FastMCP for /mcp =====
    // This will be handled by FastMCP's middleware
    if (url.pathname.startsWith("/mcp")) {
      // Let FastMCP handle it - we'll integrate this below
      return
    }

    // 404
    json({ error: "not_found" }, 404)
  })
}

// ========== LinkedIn Client Helpers ==========
function createLinkedInClientFromSession(session: LinkedInSession): LinkedInClient {
  return new LinkedInClient({
    clientId: clientId!,
    clientSecret: clientSecret!,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    userAgent,
  })
}

function createMarketingClientFromSession(session: LinkedInSession): LinkedInMarketingClient {
  return new LinkedInMarketingClient({
    clientId: clientId!,
    clientSecret: clientSecret!,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    userAgent,
  })
}

// ========== FastMCP Server ==========
const server = new FastMCP<LinkedInSession | undefined>({
  name: "linkedin-api-mcp-server",
  version: "1.0.0",
  instructions: `LinkedIn MCP Server with automatic OAuth authentication.
Connect via HTTP and the server will guide you through LinkedIn OAuth automatically.`,

  // OAuth configuration - point to our custom endpoints
  oauth: {
    enabled: true,
    authorizationServer: {
      issuer: baseUrl,
      authorizationEndpoint: `${baseUrl}/oauth/authorize`,
      tokenEndpoint: `${baseUrl}/oauth/token`,
      responseTypesSupported: ["code"],
      codeChallengeMethodsSupported: ["S256", "plain"],
      grantTypesSupported: ["authorization_code"],
      scopesSupported: LINKEDIN_SCOPES,
      registrationEndpoint: `${baseUrl}/oauth/register`,
    },
    protectedResource: {
      resource: mcpUrl,
      authorizationServers: [baseUrl],
      scopesSupported: LINKEDIN_SCOPES,
    },
  },

  authenticate: async (request) => {
    const authHeader = request.headers.authorization

    if (!authHeader?.startsWith("Bearer ")) {
      return undefined
    }

    const token = authHeader.slice(7)
    const result = verifyJWT(token)

    if (!result.valid || !result.payload?.sub) {
      return undefined
    }

    const jti = result.payload.sub as string
    const stored = tokenStore.get(jti)

    if (!stored) {
      return undefined
    }

    return stored.linkedInTokens
  },
})

// ===== MCP Tools =====
server.addTool({
  name: "test_connection",
  description: "Test the LinkedIn MCP Server connection",
  parameters: z.object({}),
  execute: async (_args, { session }) => {
    const status = session?.accessToken ? "✅ Authenticated" : "❌ Not authenticated"
    return `LinkedIn MCP Server\n- Status: ${status}\n- Scopes: ${LINKEDIN_SCOPES.join(", ")}`
  },
})

server.addTool({
  name: "get_my_profile",
  description: "Get the authenticated user's LinkedIn profile",
  parameters: z.object({}),
  execute: async (_args, { session }) => {
    if (!session?.accessToken) throw new Error("Not authenticated")
    const client = createLinkedInClientFromSession(session)
    const profile = await client.getCurrentUserProfile()
    return formatProfileDetailed(profile)
  },
})

server.addTool({
  name: "get_profile",
  description: "Get a LinkedIn profile by person URN",
  parameters: z.object({
    person_urn: z.string().describe("Person URN (e.g., urn:li:person:abc123)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.accessToken) throw new Error("Not authenticated")
    const client = createLinkedInClientFromSession(session)
    const profile = await client.getProfile(args.person_urn)
    return formatProfileDetailed(profile)
  },
})

server.addTool({
  name: "search_people",
  description: "Search for people on LinkedIn",
  parameters: z.object({
    keywords: z.string().optional().describe("Keywords to search"),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    company: z.string().optional(),
    title: z.string().optional(),
    count: z.number().min(1).max(50).default(10),
  }),
  execute: async (args, { session }) => {
    if (!session?.accessToken) throw new Error("Not authenticated")
    const client = createLinkedInClientFromSession(session)
    const results = await client.searchPeople({
      keywords: args.keywords,
      firstName: args.first_name,
      lastName: args.last_name,
      company: args.company,
      title: args.title,
      count: args.count,
    })
    if (results.elements.length === 0) return "No people found."
    return `Found ${results.elements.length} people:\n\n${results.elements.map((p, i) => `${i + 1}. ${formatProfileDetailed(p)}`).join("\n\n")}`
  },
})

server.addTool({
  name: "get_company",
  description: "Get company information by URN",
  parameters: z.object({
    organization_urn: z.string().describe("Organization URN (e.g., urn:li:organization:123456)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.accessToken) throw new Error("Not authenticated")
    const client = createLinkedInClientFromSession(session)
    const org = await client.getOrganization(args.organization_urn)
    return formatOrganizationDetailed(org)
  },
})

server.addTool({
  name: "search_companies",
  description: "Search for companies on LinkedIn",
  parameters: z.object({
    keywords: z.string().describe("Keywords to search"),
    count: z.number().min(1).max(50).default(10),
  }),
  execute: async (args, { session }) => {
    if (!session?.accessToken) throw new Error("Not authenticated")
    const client = createLinkedInClientFromSession(session)
    const results = await client.searchCompanies({ keywords: args.keywords, count: args.count })
    if (results.elements.length === 0) return "No companies found."
    return `Found ${results.elements.length} companies:\n\n${results.elements.map((o, i) => `${i + 1}. ${formatOrganizationDetailed(o)}`).join("\n\n")}`
  },
})

server.addTool({
  name: "get_post_analytics",
  description: "Get analytics for a post",
  parameters: z.object({
    share_urn: z.string().describe("Share URN (e.g., urn:li:share:123456)"),
  }),
  execute: async (args, { session }) => {
    if (!session?.accessToken) throw new Error("Not authenticated")
    const client = createLinkedInClientFromSession(session)
    const stats = await client.getShareStatistics(args.share_urn)
    return formatShareStatistics(stats)
  },
})

// ===== Start Server =====
async function main() {
  const useStdio = process.env.TRANSPORT_TYPE === "stdio"

  if (useStdio) {
    console.error("[Setup] Starting in stdio mode")
    await server.start({ transportType: "stdio" })
  } else {
    // Start OAuth server on main port
    const oauthServer = createOAuthMCPServer()
    oauthServer.listen(serverPort, serverHost, () => {
      console.error(`[Setup] OAuth server ready at ${baseUrl}`)
    })

    // Start FastMCP on port + 1
    await server.start({
      transportType: "httpStream",
      httpStream: {
        port: mcpPort,
        host: serverHost,
        endpoint: "/mcp",
      },
    })

    console.error(`[Setup] MCP server ready at http://${serverHost}:${mcpPort}/mcp`)
    console.error("")
    console.error("[OAuth] Automatic OAuth flow:")
    console.error(`  1. Connect MCP client to: http://${serverHost}:${mcpPort}/mcp`)
    console.error(`  2. Discovery endpoint:    ${baseUrl}/.well-known/oauth-authorization-server`)
    console.error(`  3. The MCP client will automatically handle OAuth via browser`)
    console.error("")
    console.error("[Config] Update .mcp.json:")
    console.error(`  {`)
    console.error(`    "mcpServers": {`)
    console.error(`      "linkedin": {`)
    console.error(`        "type": "http",`)
    console.error(`        "url": "http://${serverHost}:${mcpPort}/mcp"`)
    console.error(`      }`)
    console.error(`    }`)
    console.error(`  }`)
  }
}

process.on("SIGINT", () => process.exit(0))
process.on("SIGTERM", () => process.exit(0))

main().catch(console.error)
