import type {
  CreatePostRequest,
  FollowerStatistics,
  LinkedInClientConfig,
  LinkedInPaginatedResponse,
  LinkedInPost,
  MediaUploadRequest,
  MediaUploadResponse,
  OrganizationPageStatistics,
  OrganizationUrn,
  PersonUrn,
  ShareStatistics,
  ShareUrn,
} from "../types"

/**
 * LinkedIn Marketing API Client
 * Handles company/organization management, analytics, and content posting
 */
export class LinkedInMarketingClient {
  private clientId: string
  private clientSecret: string
  private accessToken?: string
  private refreshToken?: string
  private tokenExpiry: number = 0
  private baseUrl: string = "https://api.linkedin.com/v2"
  private userAgent: string

  constructor(config: LinkedInClientConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.userAgent = config.userAgent || "LinkedInMCPServer/1.0.0"
    this.accessToken = config.accessToken
    this.refreshToken = config.refreshToken

    if (this.accessToken) {
      this.tokenExpiry = Date.now() + 60 * 60 * 1000 // 1 hour default
    }
  }

  /**
   * Make authenticated request to LinkedIn Marketing API
   */
  private async makeRequest(path: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) {
      throw new Error("No access token available for Marketing API")
    }

    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`
    const headers = {
      "User-Agent": this.userAgent,
      Authorization: `Bearer ${this.accessToken}`,
      "LinkedIn-Version": "202501",
      "X-Restli-Protocol-Version": "2.0.0",
      ...options.headers,
    }

    return fetch(url, {
      ...options,
      headers,
    })
  }

  // ===== ORGANIZATION CONTENT METHODS =====

  /**
   * Create a post on behalf of an organization
   */
  async createOrganizationPost(request: CreatePostRequest): Promise<LinkedInPost> {
    const payload = {
      author: request.author,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: {
            text: request.text || "",
          },
          shareMediaCategory: request.media?.length ? "IMAGE" : request.article ? "ARTICLE" : "NONE",
          ...(request.media?.length && {
            media: request.media.map((mediaUrn) => ({
              status: "READY",
              media: mediaUrn,
            })),
          }),
          ...(request.article && {
            media: [
              {
                status: "READY",
                originalUrl: request.article.url,
                title: {
                  text: request.article.title || "",
                },
                description: {
                  text: request.article.description || "",
                },
              },
            ],
          }),
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": request.visibility || "PUBLIC",
      },
    }

    const response = await this.makeRequest("/ugcPosts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to create organization post: ${response.status} - ${error}`)
    }

    const data = await response.json()
    return this.normalizePost(data)
  }

  /**
   * Get organization shares/posts
   */
  async getOrganizationShares(
    organizationUrn: OrganizationUrn,
    count: number = 10,
    start: number = 0,
  ): Promise<LinkedInPaginatedResponse<LinkedInPost>> {
    const params = new URLSearchParams({
      q: "owner",
      owner: organizationUrn,
      count: String(count),
      start: String(start),
    })

    const response = await this.makeRequest(`/ugcPosts?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Failed to get organization shares: ${response.status}`)
    }

    const data = (await response.json()) as { elements?: unknown[]; paging?: { count: number; start: number } }
    return {
      elements: data.elements?.map((p) => this.normalizePost(p)) || [],
      paging: data.paging || { count, start },
    }
  }

  /**
   * Delete an organization post
   */
  async deleteOrganizationPost(shareUrn: ShareUrn): Promise<void> {
    const response = await this.makeRequest(`/ugcPosts/${encodeURIComponent(shareUrn)}`, {
      method: "DELETE",
    })

    if (!response.ok) {
      throw new Error(`Failed to delete post: ${response.status}`)
    }
  }

  // ===== MEDIA UPLOAD METHODS =====

  /**
   * Register media for upload
   */
  async registerUpload(request: MediaUploadRequest): Promise<MediaUploadResponse> {
    const payload = {
      registerUploadRequest: {
        owner: request.owner,
        recipes:
          request.mediaType === "IMAGE"
            ? ["urn:li:digitalmediaRecipe:feedshare-image"]
            : ["urn:li:digitalmediaRecipe:feedshare-video"],
        serviceRelationships: [
          {
            relationshipType: "OWNER",
            identifier: "urn:li:userGeneratedContent",
          },
        ],
      },
    }

    const response = await this.makeRequest("/assets?action=registerUpload", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Failed to register upload: ${response.status} - ${error}`)
    }

    const data = await response.json()
    return {
      asset: data.value.asset,
      uploadUrl: data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl,
      uploadInstructions: data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"]
        .headers
        ? [
            {
              uploadUrl:
                data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].uploadUrl,
              headers: data.value.uploadMechanism["com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"].headers,
              firstByte: 0,
              lastByte: request.fileSize || 0,
            },
          ]
        : undefined,
    }
  }

  /**
   * Upload media file to LinkedIn
   */
  async uploadMedia(
    uploadUrl: string,
    fileBuffer: Buffer | ArrayBuffer,
    headers?: Record<string, string>,
  ): Promise<void> {
    // Convert Buffer to Uint8Array for fetch compatibility
    const body = fileBuffer instanceof Buffer ? new Uint8Array(fileBuffer) : new Uint8Array(fileBuffer)

    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
      },
      body,
    })

    if (!response.ok) {
      throw new Error(`Failed to upload media: ${response.status}`)
    }
  }

  // ===== ANALYTICS METHODS =====

  /**
   * Get share statistics for organization content
   */
  async getOrganizationShareStatistics(
    organizationUrn: OrganizationUrn,
    shareUrns?: ShareUrn[],
  ): Promise<ShareStatistics[]> {
    const params = new URLSearchParams({
      q: "organizationalEntity",
      organizationalEntity: organizationUrn,
    })

    if (shareUrns?.length) {
      params.append("shares", shareUrns.map(encodeURIComponent).join(","))
    }

    const response = await this.makeRequest(`/organizationalEntityShareStatistics?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Failed to get share statistics: ${response.status}`)
    }

    const data = await response.json()
    return data.elements || []
  }

  /**
   * Get follower statistics for an organization
   */
  async getFollowerStatistics(organizationUrn: OrganizationUrn): Promise<FollowerStatistics> {
    const params = new URLSearchParams({
      q: "organizationalEntity",
      organizationalEntity: organizationUrn,
    })

    const response = await this.makeRequest(`/networkSizes?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Failed to get follower statistics: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Get organization page statistics
   */
  async getOrganizationPageStatistics(
    organizationUrn: OrganizationUrn,
    timeRange: { start: number; end: number },
  ): Promise<OrganizationPageStatistics> {
    const params = new URLSearchParams({
      q: "organization",
      organization: organizationUrn,
      timeGranularityType: "DAY",
      timeIntervals: JSON.stringify({
        start: timeRange.start,
        end: timeRange.end,
      }),
    })

    const response = await this.makeRequest(`/organizationPageStatistics?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Failed to get page statistics: ${response.status}`)
    }

    return response.json()
  }

  /**
   * Get organizations the authenticated user can manage
   */
  async getAdministratedCompanies(personUrn: PersonUrn): Promise<LinkedInPaginatedResponse<OrganizationUrn>> {
    const params = new URLSearchParams({
      q: "roleAssignee",
      role: "ADMINISTRATOR",
      state: "APPROVED",
      projection: "(elements*(organization~(localizedName,vanityName)))",
    })

    const response = await this.makeRequest(`/organizationAcls?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Failed to get administrated companies: ${response.status}`)
    }

    const data = (await response.json()) as {
      elements?: Array<{ organization: OrganizationUrn }>
      paging?: { count: number; start: number }
    }
    return {
      elements: data.elements?.map((e) => e.organization) || [],
      paging: data.paging || { count: 0, start: 0 },
    }
  }

  // ===== HELPER METHODS =====

  private normalizePost(data: unknown): LinkedInPost {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    return {
      id: d.id || "",
      urn: d.id ? `urn:li:share:${d.id}` : "",
      author: d.author || "",
      text: d.specificContent?.["com.linkedin.ugc.ShareContent"]?.shareCommentary?.text || "",
      visibility: d.visibility?.["com.linkedin.ugc.MemberNetworkVisibility"] || "PUBLIC",
      lifecycleState: d.lifecycleState || "PUBLISHED",
      created: d.created?.time || Date.now(),
      lastModified: d.lastModified?.time || Date.now(),
    }
  }
}

// Singleton instance
let marketingClient: LinkedInMarketingClient | null = null

export function initializeMarketingClient(config: LinkedInClientConfig): LinkedInMarketingClient {
  marketingClient = new LinkedInMarketingClient(config)
  return marketingClient
}

export function getMarketingClient(): LinkedInMarketingClient | null {
  return marketingClient
}
