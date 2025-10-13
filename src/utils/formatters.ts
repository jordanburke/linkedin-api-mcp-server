import type {
  FormattedOrganization,
  FormattedPost,
  FormattedProfile,
  LinkedInOrganization,
  LinkedInPost,
  LinkedInProfile,
  ShareStatistics,
} from "../types"

/**
 * Format profile for display
 */
export function formatProfile(profile: LinkedInProfile): FormattedProfile {
  const name = `${profile.firstName} ${profile.lastName}`.trim()
  const profileUrl = profile.vanityName
    ? `https://www.linkedin.com/in/${profile.vanityName}`
    : `https://www.linkedin.com/in/${profile.id}`

  return {
    name,
    headline: profile.headline || "No headline",
    location: profile.location?.name || "Location not specified",
    profileUrl,
    picture: profile.profilePicture?.url,
    summary: "",
  }
}

/**
 * Format organization for display
 */
export function formatOrganization(org: LinkedInOrganization): FormattedOrganization {
  const followers = org.followerCount ? org.followerCount.toLocaleString() : "N/A"
  const employees = org.staffCount ? org.staffCount.toLocaleString() : "N/A"

  return {
    name: org.name,
    description: org.description || "No description available",
    industry: org.industry || "Not specified",
    website: org.website || "No website",
    followers,
    employees,
    logo: org.logo?.url,
  }
}

/**
 * Format post for display
 */
export function formatPost(post: LinkedInPost, stats?: ShareStatistics): FormattedPost {
  const createdDate = new Date(post.created)
  const authorType = post.author.includes("organization") ? "Company" : "Person"

  return {
    id: post.id,
    author: `${authorType}: ${post.author}`,
    text: post.text || "No content",
    visibility: post.visibility,
    created: createdDate.toLocaleString(),
    engagement: stats
      ? {
          likes: stats.totalShareStatistics.likeCount,
          comments: stats.totalShareStatistics.commentCount,
          shares: stats.totalShareStatistics.shareCount,
        }
      : undefined,
    url: `https://www.linkedin.com/feed/update/${post.urn}`,
  }
}

/**
 * Format share statistics for display
 */
export function formatShareStatistics(stats: ShareStatistics): string {
  const total = stats.totalShareStatistics

  return `
## Engagement Metrics
- **Likes**: ${total.likeCount.toLocaleString()}
- **Comments**: ${total.commentCount.toLocaleString()}
- **Shares**: ${total.shareCount.toLocaleString()}
- **Total Engagement**: ${total.engagement.toLocaleString()}

## Reach Metrics
- **Impressions**: ${total.impressionCount.toLocaleString()}
- **Unique Impressions**: ${total.uniqueImpressionsCount.toLocaleString()}
- **Click Count**: ${total.clickCount.toLocaleString()}

## Engagement Rate
- **Rate**: ${((total.engagement / total.impressionCount) * 100).toFixed(2)}%
`.trim()
}

/**
 * Format error for display
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

/**
 * Format profile for detailed display
 */
export function formatProfileDetailed(profile: LinkedInProfile): string {
  const formatted = formatProfile(profile)

  return `
# ${formatted.name}

## Profile Information
- **Headline**: ${formatted.headline}
- **Location**: ${formatted.location}
- **Profile URL**: ${formatted.profileUrl}
${formatted.picture ? `- **Picture**: ${formatted.picture}` : ""}

## LinkedIn URN
- ${profile.urn}
`.trim()
}

/**
 * Format organization for detailed display
 */
export function formatOrganizationDetailed(org: LinkedInOrganization): string {
  const formatted = formatOrganization(org)

  return `
# ${formatted.name}

## Company Information
- **Industry**: ${formatted.industry}
- **Website**: ${formatted.website}
- **Followers**: ${formatted.followers}
- **Employees**: ${formatted.employees}

## Description
${formatted.description}

${formatted.logo ? `## Logo\n${formatted.logo}` : ""}

## LinkedIn URN
- ${org.urn}

${org.specialties?.length ? `## Specialties\n${org.specialties.map((s) => `- ${s}`).join("\n")}` : ""}
`.trim()
}

/**
 * Format post for detailed display
 */
export function formatPostDetailed(post: LinkedInPost, stats?: ShareStatistics): string {
  const formatted = formatPost(post, stats)

  let output = `
# LinkedIn Post

## Post Information
- **ID**: ${formatted.id}
- **Author**: ${formatted.author}
- **Created**: ${formatted.created}
- **Visibility**: ${formatted.visibility}
- **Status**: ${post.lifecycleState}
- **URL**: ${formatted.url}

## Content
${formatted.text}
`.trim()

  if (stats) {
    output += `\n\n${formatShareStatistics(stats)}`
  }

  return output
}
