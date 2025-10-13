import { describe, expect, it } from "vitest"
import { formatProfile, formatOrganization } from "../src/utils/formatters"
import type { LinkedInProfile, LinkedInOrganization } from "../src/types"

describe("LinkedIn Formatters", () => {
  it("should format profile correctly", () => {
    const profile: LinkedInProfile = {
      id: "test123",
      urn: "urn:li:person:test123",
      firstName: "John",
      lastName: "Doe",
      headline: "Software Engineer",
      vanityName: "johndoe",
    }

    const formatted = formatProfile(profile)

    expect(formatted.name).toBe("John Doe")
    expect(formatted.headline).toBe("Software Engineer")
    expect(formatted.profileUrl).toBe("https://www.linkedin.com/in/johndoe")
  })

  it("should format organization correctly", () => {
    const org: LinkedInOrganization = {
      id: "company123",
      urn: "urn:li:organization:company123",
      name: "Test Company",
      description: "A test company",
      industry: "Technology",
      website: "https://example.com",
      followerCount: 1000,
      staffCount: 50,
    }

    const formatted = formatOrganization(org)

    expect(formatted.name).toBe("Test Company")
    expect(formatted.industry).toBe("Technology")
    expect(formatted.followers).toBe("1,000")
    expect(formatted.employees).toBe("50")
  })
})
