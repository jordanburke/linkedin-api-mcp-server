// LinkedIn API Configuration
export type LinkedInClientConfig = {
  clientId: string
  clientSecret: string
  redirectUri?: string
  accessToken?: string
  refreshToken?: string
  userAgent?: string
}

// LinkedIn Person URN format: urn:li:person:abc123
export type PersonUrn = string
export type OrganizationUrn = string
export type ShareUrn = string
export type MediaUrn = string

// ===== PROFILE & USER TYPES =====

export type LinkedInProfile = {
  id: string
  urn: PersonUrn
  firstName: string
  lastName: string
  headline?: string
  profilePicture?: {
    displayImage: string
    url?: string
  }
  vanityName?: string
  location?: {
    name: string
    country?: string
  }
}

export type LinkedInProfileFull = LinkedInProfile & {
  summary?: string
  industry?: string
  positions?: LinkedInPosition[]
  educations?: LinkedInEducation[]
}

export type LinkedInPosition = {
  title: string
  companyName: string
  companyUrn?: OrganizationUrn
  description?: string
  location?: string
  startDate?: { year: number; month?: number }
  endDate?: { year: number; month?: number }
  current?: boolean
}

export type LinkedInEducation = {
  schoolName: string
  schoolUrn?: OrganizationUrn
  degree?: string
  fieldOfStudy?: string
  startDate?: { year: number; month?: number }
  endDate?: { year: number; month?: number }
}

// ===== COMPANY/ORGANIZATION TYPES =====

export type LinkedInOrganization = {
  id: string
  urn: OrganizationUrn
  name: string
  description?: string
  website?: string
  industry?: string
  companyType?: string
  specialties?: string[]
  logo?: {
    url: string
  }
  coverPhoto?: {
    url: string
  }
  followerCount?: number
  staffCount?: number
  locations?: OrganizationLocation[]
}

export type OrganizationLocation = {
  description?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
  }
  geographic?: {
    latitude: number
    longitude: number
  }
}

// ===== POST & CONTENT TYPES =====

export type LinkedInPost = {
  id: string
  urn: ShareUrn
  author: PersonUrn | OrganizationUrn
  text?: string
  visibility: "PUBLIC" | "CONNECTIONS" | "LOGGED_IN"
  lifecycleState: "PUBLISHED" | "DRAFT" | "DELETED"
  created: number
  lastModified: number
  commentary?: string
  content?: PostContent
  reshareContext?: {
    parent: ShareUrn
  }
}

export type PostContent = {
  article?: {
    title?: string
    description?: string
    source?: string
    thumbnail?: string
  }
  media?: MediaContent[]
}

export type MediaContent = {
  status: "READY" | "PROCESSING" | "FAILED"
  media: MediaUrn
  title?: string
  description?: string
  thumbnails?: string[]
}

export type CreatePostRequest = {
  author: PersonUrn | OrganizationUrn
  text?: string
  visibility?: "PUBLIC" | "CONNECTIONS"
  media?: MediaUrn[]
  article?: {
    title?: string
    description?: string
    url: string
  }
}

// ===== MEDIA UPLOAD TYPES =====

export type MediaUploadRequest = {
  owner: PersonUrn | OrganizationUrn
  mediaType: "IMAGE" | "VIDEO" | "DOCUMENT"
  fileName?: string
  fileSize?: number
}

export type MediaUploadResponse = {
  asset: MediaUrn
  uploadUrl: string
  uploadInstructions?: UploadInstruction[]
}

export type UploadInstruction = {
  uploadUrl: string
  headers?: Record<string, string>
  firstByte: number
  lastByte: number
}

// ===== ANALYTICS & INSIGHTS TYPES =====

export type ShareStatistics = {
  totalShareStatistics: {
    shareCount: number
    likeCount: number
    commentCount: number
    engagement: number
    clickCount: number
    impressionCount: number
    uniqueImpressionsCount: number
  }
  organizationFollowerStatistics?: {
    followerGains: number
    followerLosses: number
  }
}

export type FollowerStatistics = {
  firstDegreeSize: number
  secondDegreeSize: number
  followerCountsByFunction?: FunctionCount[]
  followerCountsBySeniority?: SeniorityCount[]
  followerCountsByIndustry?: IndustryCount[]
  followerCountsByRegion?: RegionCount[]
  followerCountsByStaffCountRange?: StaffCountRange[]
}

export type FunctionCount = {
  function: string
  followerCounts: {
    organicFollowerCount: number
    paidFollowerCount: number
  }
}

export type SeniorityCount = {
  seniority: string
  followerCounts: {
    organicFollowerCount: number
    paidFollowerCount: number
  }
}

export type IndustryCount = {
  industry: string
  followerCounts: {
    organicFollowerCount: number
    paidFollowerCount: number
  }
}

export type RegionCount = {
  region: string
  followerCounts: {
    organicFollowerCount: number
    paidFollowerCount: number
  }
}

export type StaffCountRange = {
  staffCountRange: string
  followerCounts: {
    organicFollowerCount: number
    paidFollowerCount: number
  }
}

export type OrganizationPageStatistics = {
  pageStatistics: {
    views: {
      allPageViews: number
      uniquePageViews: number
    }
    clicks: {
      careersPageClicks: number
      customButtonClickCounts: number
    }
  }
  timeRange: {
    start: number
    end: number
  }
}

// ===== COMMENT TYPES =====

export type LinkedInComment = {
  id: string
  actor: PersonUrn
  message: string
  created: number
  lastModified?: number
  parentComment?: string
  object: ShareUrn
}

// ===== CONNECTION TYPES =====

export type LinkedInConnection = {
  id: string
  person: PersonUrn
  firstName: string
  lastName: string
  headline?: string
  profilePicture?: string
  connectedAt?: number
}

export type ConnectionRequest = {
  inviter: PersonUrn
  invitee: PersonUrn
  message?: string
  sentTime?: number
}

// ===== SEARCH TYPES =====

export type SearchPeopleRequest = {
  keywords?: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  school?: string
  count?: number
  start?: number
}

export type SearchCompaniesRequest = {
  keywords?: string
  count?: number
  start?: number
}

// ===== API RESPONSE TYPES =====

export type LinkedInApiError = {
  status: number
  message: string
  serviceErrorCode?: number
}

export type LinkedInPaginatedResponse<T> = {
  elements: T[]
  paging: {
    count: number
    start: number
    total?: number
    links?: {
      rel: string
      href: string
    }[]
  }
}

// ===== OAUTH TYPES =====

export type OAuthTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
  refresh_token_expires_in?: number
  scope?: string
}

export type OAuthRefreshTokenResponse = {
  access_token: string
  expires_in: number
  refresh_token?: string
}

// ===== FORMATTED OUTPUT TYPES =====

export type FormattedProfile = {
  name: string
  headline: string
  location: string
  profileUrl: string
  picture?: string
  summary?: string
}

export type FormattedOrganization = {
  name: string
  description: string
  industry: string
  website: string
  followers: string
  employees: string
  logo?: string
}

export type FormattedPost = {
  id: string
  author: string
  text: string
  visibility: string
  created: string
  engagement?: {
    likes: number
    comments: number
    shares: number
  }
  url: string
}
