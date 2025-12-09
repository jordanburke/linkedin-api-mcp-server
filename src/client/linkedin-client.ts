import type {
  LinkedInApiError,
  LinkedInClientConfig,
  LinkedInOrganization,
  LinkedInPaginatedResponse,
  LinkedInPost,
  LinkedInProfile,
  OAuthRefreshTokenResponse,
  OAuthTokenResponse,
  OrganizationUrn,
  PersonUrn,
  SearchCompaniesRequest,
  SearchPeopleRequest,
  ShareStatistics,
} from "../types"

export class LinkedInClient {
  private clientId: string
  private clientSecret: string
  private redirectUri?: string
  private userAgent: string
  private accessToken?: string
  private refreshToken?: string
  private tokenExpiry: number = 0
  private baseUrl: string = "https://api.linkedin.com/v2"
  private authenticated: boolean = false

  constructor(config: LinkedInClientConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.userAgent = config.userAgent || "LinkedInMCPServer/1.0.0"
    this.accessToken = config.accessToken
    this.refreshToken = config.refreshToken

    // If access token is provided, mark as authenticated
    if (this.accessToken) {
      this.authenticated = true
      // Set a far future expiry if we don't know when it expires
      this.tokenExpiry = Date.now() + 60 * 60 * 1000 // 1 hour from now
    }
  }

  /**
   * Make authenticated request to LinkedIn API
   */
  private async makeRequest(path: string, options: RequestInit = {}): Promise<Response> {
    // Check if we need to refresh token
    if (Date.now() >= this.tokenExpiry && this.refreshToken) {
      await this.refreshAccessToken()
    }

    if (!this.accessToken) {
      throw new Error("No access token available. Please authenticate first.")
    }

    const url = path.startsWith("http") ? path : `${this.baseUrl}${path}`
    const headers = {
      "User-Agent": this.userAgent,
      Authorization: `Bearer ${this.accessToken}`,
      "LinkedIn-Version": "202501",
      "X-Restli-Protocol-Version": "2.0.0",
      ...options.headers,
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    // If unauthorized and we have a refresh token, try refreshing once
    if (response.status === 401 && this.refreshToken) {
      await this.refreshAccessToken()
      const retryHeaders = {
        ...headers,
        Authorization: `Bearer ${this.accessToken}`,
      }
      return fetch(url, {
        ...options,
        headers: retryHeaders,
      })
    }

    return response
  }

  /**
   * Exchange authorization code for access token (3-legged OAuth)
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenResponse> {
    const tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken"
    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: this.redirectUri || "",
    })

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = (await response.json()) as LinkedInApiError
      throw new Error(`OAuth token exchange failed: ${error.message}`)
    }

    const data = (await response.json()) as OAuthTokenResponse
    this.accessToken = data.access_token
    this.refreshToken = data.refresh_token
    this.tokenExpiry = Date.now() + data.expires_in * 1000
    this.authenticated = true

    return data
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refresh token available")
    }

    const tokenUrl = "https://www.linkedin.com/oauth/v2/accessToken"
    const params = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    })

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    })

    if (!response.ok) {
      const error = (await response.json()) as LinkedInApiError
      throw new Error(`Token refresh failed: ${error.message}`)
    }

    const data = (await response.json()) as OAuthRefreshTokenResponse
    this.accessToken = data.access_token
    if (data.refresh_token) {
      this.refreshToken = data.refresh_token
    }
    this.tokenExpiry = Date.now() + data.expires_in * 1000
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(scopes: string[], state?: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.clientId,
      redirect_uri: this.redirectUri || "",
      scope: scopes.join(" "),
      ...(state && { state }),
    })

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`
  }

  /**
   * Check if client is authenticated
   */
  async checkAuthentication(): Promise<boolean> {
    if (!this.authenticated || !this.accessToken) {
      return false
    }

    try {
      // Try to get current user profile as auth check
      await this.getCurrentUserProfile()
      return true
    } catch {
      return false
    }
  }

  // ===== PROFILE METHODS =====

  /**
   * Get current authenticated user's profile
   * Uses the userinfo endpoint for OpenID Connect compatibility
   */
  async getCurrentUserProfile(): Promise<LinkedInProfile> {
    // Try userinfo endpoint first (OpenID Connect)
    const response = await this.makeRequest("/userinfo")

    if (!response.ok) {
      throw new Error(`Failed to get current user profile: ${response.status}`)
    }

    const data = await response.json()
    // userinfo returns: sub, name, given_name, family_name, picture, email, email_verified, locale
    return {
      id: data.sub || "",
      firstName: data.given_name || data.name?.split(" ")[0] || "",
      lastName: data.family_name || data.name?.split(" ").slice(1).join(" ") || "",
      headline: "",
      profilePicture: data.picture || "",
      email: data.email,
      vanityName: "",
    }
  }

  /**
   * Get profile by person URN
   */
  async getProfile(personUrn: PersonUrn): Promise<LinkedInProfile> {
    const response = await this.makeRequest(`/people/${encodeURIComponent(personUrn)}`)

    if (!response.ok) {
      throw new Error(`Failed to get profile: ${response.status}`)
    }

    const data = await response.json()
    return this.normalizeProfile(data)
  }

  /**
   * Search for people
   */
  async searchPeople(request: SearchPeopleRequest): Promise<LinkedInPaginatedResponse<LinkedInProfile>> {
    const params = new URLSearchParams()

    if (request.keywords) params.append("keywords", request.keywords)
    if (request.firstName) params.append("firstName", request.firstName)
    if (request.lastName) params.append("lastName", request.lastName)
    if (request.company) params.append("company", request.company)
    if (request.title) params.append("title", request.title)
    if (request.school) params.append("school", request.school)
    params.append("count", String(request.count || 10))
    params.append("start", String(request.start || 0))

    const response = await this.makeRequest(`/peopleSearch?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Failed to search people: ${response.status}`)
    }

    const data = (await response.json()) as { elements?: unknown[]; paging?: { count: number; start: number } }
    return {
      elements: data.elements?.map((p) => this.normalizeProfile(p)) || [],
      paging: data.paging || { count: 0, start: 0 },
    }
  }

  // ===== COMPANY/ORGANIZATION METHODS =====

  /**
   * Get organization by URN
   */
  async getOrganization(organizationUrn: OrganizationUrn): Promise<LinkedInOrganization> {
    const response = await this.makeRequest(`/organizations/${encodeURIComponent(organizationUrn)}`)

    if (!response.ok) {
      throw new Error(`Failed to get organization: ${response.status}`)
    }

    const data = await response.json()
    return this.normalizeOrganization(data)
  }

  /**
   * Search for companies
   */
  async searchCompanies(request: SearchCompaniesRequest): Promise<LinkedInPaginatedResponse<LinkedInOrganization>> {
    const params = new URLSearchParams()

    if (request.keywords) params.append("keywords", request.keywords)
    params.append("count", String(request.count || 10))
    params.append("start", String(request.start || 0))

    const response = await this.makeRequest(`/organizationSearch?${params.toString()}`)

    if (!response.ok) {
      throw new Error(`Failed to search companies: ${response.status}`)
    }

    const data = (await response.json()) as { elements?: unknown[]; paging?: { count: number; start: 0 } }
    return {
      elements: data.elements?.map((o) => this.normalizeOrganization(o)) || [],
      paging: data.paging || { count: 0, start: 0 },
    }
  }

  // ===== POST/SHARE METHODS =====

  /**
   * Get share/post by URN
   */
  async getShare(shareUrn: string): Promise<LinkedInPost> {
    const response = await this.makeRequest(`/shares/${encodeURIComponent(shareUrn)}`)

    if (!response.ok) {
      throw new Error(`Failed to get share: ${response.status}`)
    }

    const data = await response.json()
    return this.normalizePost(data)
  }

  /**
   * Get share statistics
   */
  async getShareStatistics(shareUrn: string): Promise<ShareStatistics> {
    const response = await this.makeRequest(
      `/organizationalEntityShareStatistics?q=organizationalEntity&shares=${encodeURIComponent(shareUrn)}`,
    )

    if (!response.ok) {
      throw new Error(`Failed to get share statistics: ${response.status}`)
    }

    return response.json()
  }

  // ===== HELPER/NORMALIZATION METHODS =====

  private normalizeProfile(data: unknown): LinkedInProfile {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    return {
      id: d.id || "",
      urn: d.id ? `urn:li:person:${d.id}` : "",
      firstName: d.firstName?.localized?.en_US || d.localizedFirstName || "",
      lastName: d.lastName?.localized?.en_US || d.localizedLastName || "",
      headline: d.headline?.localized?.en_US || d.localizedHeadline || "",
      profilePicture: d.profilePicture
        ? {
            displayImage: d.profilePicture.displayImage || "",
            url: d.profilePicture["displayImage~"]?.elements?.[0]?.identifiers?.[0]?.identifier || "",
          }
        : undefined,
      vanityName: d.vanityName || "",
      location: d.location
        ? {
            name: d.location.name || "",
            country: d.location.country || "",
          }
        : undefined,
    }
  }

  private normalizeOrganization(data: unknown): LinkedInOrganization {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    return {
      id: d.id || "",
      urn: d.id ? `urn:li:organization:${d.id}` : "",
      name: d.name?.localized?.en_US || d.localizedName || "",
      description: d.description?.localized?.en_US || d.localizedDescription || "",
      website: d.websiteUrl || "",
      industry: d.industries?.join(", ") || "",
      companyType: d.companyType?.localized?.en_US || "",
      specialties: d.specialties || [],
      logo: d.logo
        ? {
            url: d.logo["displayImage~"]?.elements?.[0]?.identifiers?.[0]?.identifier || "",
          }
        : undefined,
      followerCount: d.followerCount || 0,
      staffCount: d.staffCount || 0,
    }
  }

  private normalizePost(data: unknown): LinkedInPost {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = data as any
    return {
      id: d.id || "",
      urn: d.id ? `urn:li:share:${d.id}` : "",
      author: d.owner || d.author || "",
      text: d.text?.text || d.commentary || "",
      visibility: d.distribution?.feedDistribution || "PUBLIC",
      lifecycleState: d.lifecycleState || "PUBLISHED",
      created: d.created?.time || Date.now(),
      lastModified: d.lastModified?.time || Date.now(),
    }
  }

  /**
   * Get access token (for debugging/external use)
   */
  getAccessToken(): string | undefined {
    return this.accessToken
  }

  /**
   * Check if authenticated
   */
  isAuthenticated(): boolean {
    return this.authenticated && !!this.accessToken
  }
}

// Singleton instance
let linkedInClient: LinkedInClient | null = null

export function initializeLinkedInClient(config: LinkedInClientConfig): LinkedInClient {
  linkedInClient = new LinkedInClient(config)
  return linkedInClient
}

export function getLinkedInClient(): LinkedInClient | null {
  return linkedInClient
}
