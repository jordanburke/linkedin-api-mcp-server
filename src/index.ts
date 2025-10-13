import dotenv from "dotenv"
import { FastMCP } from "fastmcp"
import { z } from "zod"

import { getLinkedInClient, initializeLinkedInClient } from "./client/linkedin-client"
import { getMarketingClient, initializeMarketingClient } from "./client/linkedin-marketing-client"
import {
  formatOrganizationDetailed,
  formatPostDetailed,
  formatProfileDetailed,
  formatShareStatistics,
} from "./utils/formatters"

// Load environment variables
dotenv.config()

// Initialize LinkedIn clients
async function setupLinkedInClients() {
  const clientId = process.env.LINKEDIN_CLIENT_ID
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET
  const accessToken = process.env.LINKEDIN_ACCESS_TOKEN
  const refreshToken = process.env.LINKEDIN_REFRESH_TOKEN
  const redirectUri = process.env.LINKEDIN_REDIRECT_URI
  const userAgent = process.env.LINKEDIN_USER_AGENT || "LinkedInMCPServer/1.0.0"

  if (!clientId || !clientSecret) {
    console.error(
      "[Error] Missing required LinkedIn API credentials. Please set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET environment variables.",
    )
    process.exit(1)
  }

  try {
    // Initialize personal/member client
    const client = initializeLinkedInClient({
      clientId,
      clientSecret,
      redirectUri,
      accessToken,
      refreshToken,
      userAgent,
    })

    // Initialize marketing client (for company APIs)
    initializeMarketingClient({
      clientId,
      clientSecret,
      accessToken,
      refreshToken,
      userAgent,
    })

    console.error("[Setup] LinkedIn clients initialized")

    if (accessToken) {
      console.error("[Setup] Testing LinkedIn API connection...")
      const isConnected = await client.checkAuthentication()

      if (!isConnected) {
        console.error("[Error] ✗ Failed to connect to LinkedIn API")
        console.error("[Error] Please check your LINKEDIN_ACCESS_TOKEN")
      } else {
        console.error("[Setup] ✓ LinkedIn API connection successful")
        console.error("[Setup] Full access enabled (profile, posting, companies)")
      }
    } else {
      console.error("[Setup] No access token provided")
      console.error("[Setup] OAuth flow required for API access")
      console.error("[Setup] Set LINKEDIN_ACCESS_TOKEN environment variable")
    }
  } catch (error) {
    console.error("[Error] ✗ LinkedIn API setup failed:", error instanceof Error ? error.message : error)
    console.error("[Error] Please verify your LinkedIn API credentials")
    process.exit(1)
  }
}

// Create FastMCP server
const server = new FastMCP({
  name: "linkedin-api-mcp-server",
  version: "1.0.0",
  instructions: `A comprehensive LinkedIn MCP server that provides tools for interacting with LinkedIn API.

Available capabilities:
- Personal profile management and search
- Company/organization information and search
- Create and manage posts (personal and company)
- Media upload (images, videos, documents)
- Analytics and engagement metrics
- Company page management and insights

For write operations (posting, company management), ensure LINKEDIN_ACCESS_TOKEN is configured with proper scopes.`,

  // Optional OAuth configuration for HTTP transport
  ...(process.env.OAUTH_ENABLED === "true" && {
    authenticate: async (request) => {
      const authHeader = request.headers.authorization
      const expectedToken = process.env.OAUTH_TOKEN

      if (!expectedToken) {
        const token = Array.from({ length: 32 }, () =>
          "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 62)),
        ).join("")
        console.log(`[Auth] Generated OAuth token: ${token}`)
        throw new Response(
          JSON.stringify({
            error: "No OAuth token configured",
            generatedToken: token,
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/json" },
          },
        )
      }

      if (!authHeader?.startsWith("Bearer ")) {
        throw new Response(null, {
          status: 401,
          statusText: "Missing or invalid Authorization header",
        })
      }

      const token = authHeader.slice(7)
      if (token !== expectedToken) {
        throw new Response(null, {
          status: 403,
          statusText: "Invalid token",
        })
      }

      return { authenticated: true }
    },
  }),
})

// ===== TEST TOOL =====
server.addTool({
  name: "test_linkedin_mcp_server",
  description: "Test the LinkedIn MCP Server connection and configuration",
  parameters: z.object({}),
  execute: async () => {
    const client = getLinkedInClient()
    const marketingClient = getMarketingClient()
    const hasAuth = client?.isAuthenticated() ? "✓" : "✗"
    const hasMarketingAuth = marketingClient ? "✓" : "✗"

    return `LinkedIn MCP Server Status:
- Server: ✓ Running
- Personal Client: ${hasAuth} ${client ? "Initialized" : "Not initialized"}
- Marketing Client: ${hasMarketingAuth} ${marketingClient ? "Initialized" : "Not initialized"}
- Version: 1.0.0

Ready to handle LinkedIn API requests!`
  },
})

// ===== PROFILE TOOLS =====
server.addTool({
  name: "get_my_profile",
  description: "Get the authenticated user's LinkedIn profile information",
  parameters: z.object({}),
  execute: async () => {
    const client = getLinkedInClient()
    if (!client) throw new Error("LinkedIn client not initialized")

    const profile = await client.getCurrentUserProfile()
    return formatProfileDetailed(profile)
  },
})

server.addTool({
  name: "get_profile",
  description: "Get a LinkedIn profile by person URN (format: urn:li:person:ID)",
  parameters: z.object({
    person_urn: z.string().describe("The LinkedIn person URN (e.g., urn:li:person:abc123)"),
  }),
  execute: async (args) => {
    const client = getLinkedInClient()
    if (!client) throw new Error("LinkedIn client not initialized")

    const profile = await client.getProfile(args.person_urn)
    return formatProfileDetailed(profile)
  },
})

server.addTool({
  name: "search_people",
  description: "Search for people on LinkedIn by keywords, name, company, title, or school",
  parameters: z.object({
    keywords: z.string().optional().describe("General keywords to search for"),
    first_name: z.string().optional().describe("First name"),
    last_name: z.string().optional().describe("Last name"),
    company: z.string().optional().describe("Company name"),
    title: z.string().optional().describe("Job title"),
    school: z.string().optional().describe("School/university name"),
    count: z.number().min(1).max(50).default(10).describe("Number of results to return"),
  }),
  execute: async (args) => {
    const client = getLinkedInClient()
    if (!client) throw new Error("LinkedIn client not initialized")

    const results = await client.searchPeople({
      keywords: args.keywords,
      firstName: args.first_name,
      lastName: args.last_name,
      company: args.company,
      title: args.title,
      school: args.school,
      count: args.count,
    })

    if (results.elements.length === 0) {
      return "No people found matching your search criteria."
    }

    return `# LinkedIn People Search Results\n\nFound ${results.elements.length} people:\n\n${results.elements.map((p, i) => `${i + 1}. ${formatProfileDetailed(p)}\n`).join("\n")}`
  },
})

// ===== COMPANY TOOLS =====
server.addTool({
  name: "get_company",
  description: "Get company/organization information by URN (format: urn:li:organization:ID)",
  parameters: z.object({
    organization_urn: z.string().describe("The LinkedIn organization URN (e.g., urn:li:organization:123456)"),
  }),
  execute: async (args) => {
    const client = getLinkedInClient()
    if (!client) throw new Error("LinkedIn client not initialized")

    const org = await client.getOrganization(args.organization_urn)
    return formatOrganizationDetailed(org)
  },
})

server.addTool({
  name: "search_companies",
  description: "Search for companies/organizations on LinkedIn",
  parameters: z.object({
    keywords: z.string().describe("Keywords to search for companies"),
    count: z.number().min(1).max(50).default(10).describe("Number of results to return"),
  }),
  execute: async (args) => {
    const client = getLinkedInClient()
    if (!client) throw new Error("LinkedIn client not initialized")

    const results = await client.searchCompanies({
      keywords: args.keywords,
      count: args.count,
    })

    if (results.elements.length === 0) {
      return "No companies found matching your search criteria."
    }

    return `# LinkedIn Company Search Results\n\nFound ${results.elements.length} companies:\n\n${results.elements.map((o, i) => `${i + 1}. ${formatOrganizationDetailed(o)}\n`).join("\n")}`
  },
})

server.addTool({
  name: "get_my_companies",
  description: "Get companies/organizations that the authenticated user can manage",
  parameters: z.object({
    person_urn: z.string().describe("The LinkedIn person URN (e.g., urn:li:person:abc123)"),
  }),
  execute: async (args) => {
    const marketingClient = getMarketingClient()
    if (!marketingClient) throw new Error("Marketing client not initialized")

    const results = await marketingClient.getAdministratedCompanies(args.person_urn)

    if (results.elements.length === 0) {
      return "You do not have admin access to any companies."
    }

    return `# Your Managed Companies\n\nYou can manage ${results.elements.length} companies:\n\n${results.elements.map((urn, i) => `${i + 1}. ${urn}`).join("\n")}`
  },
})

// ===== POST/CONTENT TOOLS =====
server.addTool({
  name: "create_company_post",
  description: "Create a post on behalf of a company/organization",
  parameters: z.object({
    organization_urn: z.string().describe("The organization URN (e.g., urn:li:organization:123456)"),
    text: z.string().describe("The post text/content"),
    visibility: z.enum(["PUBLIC", "CONNECTIONS"]).default("PUBLIC").describe("Post visibility"),
    article_url: z.string().optional().describe("URL of article to share (optional)"),
    article_title: z.string().optional().describe("Title of article (optional)"),
    article_description: z.string().optional().describe("Description of article (optional)"),
  }),
  execute: async (args) => {
    const marketingClient = getMarketingClient()
    if (!marketingClient) throw new Error("Marketing client not initialized")

    const post = await marketingClient.createOrganizationPost({
      author: args.organization_urn,
      text: args.text,
      visibility: args.visibility,
      ...(args.article_url && {
        article: {
          url: args.article_url,
          title: args.article_title,
          description: args.article_description,
        },
      }),
    })

    return `# Company Post Created Successfully\n\n${formatPostDetailed(post)}`
  },
})

server.addTool({
  name: "get_company_posts",
  description: "Get recent posts from a company/organization page",
  parameters: z.object({
    organization_urn: z.string().describe("The organization URN (e.g., urn:li:organization:123456)"),
    count: z.number().min(1).max(50).default(10).describe("Number of posts to retrieve"),
  }),
  execute: async (args) => {
    const marketingClient = getMarketingClient()
    if (!marketingClient) throw new Error("Marketing client not initialized")

    const results = await marketingClient.getOrganizationShares(args.organization_urn, args.count)

    if (results.elements.length === 0) {
      return "No posts found for this company."
    }

    return `# Company Posts\n\nFound ${results.elements.length} posts:\n\n${results.elements.map((p, i) => `## Post ${i + 1}\n${formatPostDetailed(p)}\n`).join("\n")}`
  },
})

server.addTool({
  name: "delete_company_post",
  description: "Delete a company post by share URN",
  parameters: z.object({
    share_urn: z.string().describe("The share URN to delete (e.g., urn:li:share:123456)"),
  }),
  execute: async (args) => {
    const marketingClient = getMarketingClient()
    if (!marketingClient) throw new Error("Marketing client not initialized")

    await marketingClient.deleteOrganizationPost(args.share_urn)
    return `Successfully deleted post: ${args.share_urn}`
  },
})

// ===== ANALYTICS TOOLS =====
server.addTool({
  name: "get_post_analytics",
  description: "Get analytics/statistics for a specific post",
  parameters: z.object({
    share_urn: z.string().describe("The share URN (e.g., urn:li:share:123456)"),
  }),
  execute: async (args) => {
    const client = getLinkedInClient()
    if (!client) throw new Error("LinkedIn client not initialized")

    const stats = await client.getShareStatistics(args.share_urn)
    return `# Post Analytics\n\n${formatShareStatistics(stats)}`
  },
})

server.addTool({
  name: "get_company_analytics",
  description: "Get analytics for company posts and engagement",
  parameters: z.object({
    organization_urn: z.string().describe("The organization URN (e.g., urn:li:organization:123456)"),
    share_urns: z.array(z.string()).optional().describe("Specific share URNs to get stats for (optional)"),
  }),
  execute: async (args) => {
    const marketingClient = getMarketingClient()
    if (!marketingClient) throw new Error("Marketing client not initialized")

    const stats = await marketingClient.getOrganizationShareStatistics(args.organization_urn, args.share_urns)

    if (stats.length === 0) {
      return "No analytics data available."
    }

    return `# Company Analytics\n\nAnalytics for ${stats.length} posts:\n\n${stats.map((s, i) => `## Post ${i + 1}\n${formatShareStatistics(s)}\n`).join("\n")}`
  },
})

server.addTool({
  name: "get_follower_statistics",
  description: "Get follower demographics and statistics for a company",
  parameters: z.object({
    organization_urn: z.string().describe("The organization URN (e.g., urn:li:organization:123456)"),
  }),
  execute: async (args) => {
    const marketingClient = getMarketingClient()
    if (!marketingClient) throw new Error("Marketing client not initialized")

    const stats = await marketingClient.getFollowerStatistics(args.organization_urn)

    return `# Follower Statistics

## Network Size
- **First Degree**: ${stats.firstDegreeSize.toLocaleString()}
- **Second Degree**: ${stats.secondDegreeSize.toLocaleString()}

${stats.followerCountsByFunction?.length ? `## By Function\n${stats.followerCountsByFunction.map((f) => `- **${f.function}**: ${f.followerCounts.organicFollowerCount.toLocaleString()} organic, ${f.followerCounts.paidFollowerCount.toLocaleString()} paid`).join("\n")}` : ""}

${stats.followerCountsByIndustry?.length ? `\n## By Industry\n${stats.followerCountsByIndustry.map((i) => `- **${i.industry}**: ${i.followerCounts.organicFollowerCount.toLocaleString()} organic`).join("\n")}` : ""}
`
  },
})

// Initialize and start server
async function main() {
  try {
    await setupLinkedInClients()

    // Default to HTTP on port 3000, unless explicitly using stdio
    const useStdio = process.env.TRANSPORT_TYPE === "stdio"
    const port = parseInt(process.env.PORT || "3000")
    const host = process.env.HOST || "0.0.0.0"

    if (useStdio) {
      console.error("[Setup] Starting in stdio mode (CLI/npx)")
      await server.start({
        transportType: "stdio",
      })
    } else {
      console.error(`[Setup] Starting HTTP server on ${host}:${port}`)
      await server.start({
        transportType: "httpStream",
        httpStream: {
          port,
          host,
          endpoint: "/mcp",
        },
      })
      console.error(`[Setup] HTTP server ready at http://${host}:${port}/mcp`)
      console.error(`[Setup] SSE endpoint available at http://${host}:${port}/sse`)
    }
  } catch (error) {
    console.error("[Error] Failed to start server:", error)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on("SIGINT", async () => {
  console.error("[Shutdown] Shutting down LinkedIn MCP Server...")
  process.exit(0)
})

process.on("SIGTERM", async () => {
  console.error("[Shutdown] Shutting down LinkedIn MCP Server...")
  process.exit(0)
})

main().catch(console.error)
