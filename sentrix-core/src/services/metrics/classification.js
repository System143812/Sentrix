/**
 * Service Classification Engine
 * Maps technical identifiers (domains, ASNs, Orgs) to human-friendly service names.
 */

const DOMAIN_RULES = [
  { pattern: /googlevideo\.com$/, label: "YouTube" },
  { pattern: /youtube\.com$/, label: "YouTube" },
  { pattern: /ytimg\.com$/, label: "YouTube" },
  { pattern: /google\.com$/, label: "Google" },
  { pattern: /gstatic\.com$/, label: "Google Services" },
  { pattern: /1e100\.net$/, label: "Google Infrastructure" },
  { pattern: /facebook\.com$/, label: "Facebook" },
  { pattern: /fbcdn\.net$/, label: "Facebook" },
  { pattern: /instagram\.com$/, label: "Instagram" },
  { pattern: /whatsapp\.com$/, label: "WhatsApp" },
  { pattern: /github\.com$/, label: "GitHub" },
  { pattern: /githubusercontent\.com$/, label: "GitHub" },
  { pattern: /microsoft\.com$/, label: "Microsoft" },
  { pattern: /office\.com$/, label: "Office 365" },
  { pattern: /windowsupdate\.com$/, label: "Windows Update" },
  { pattern: /netflix\.com$/, label: "Netflix" },
  { pattern: /nflxext\.com$/, label: "Netflix" },
  { pattern: /amazon\.com$/, label: "Amazon" },
  { pattern: /aws\.amazon\.com$/, label: "AWS" },
  { pattern: /cloudfront\.net$/, label: "Cloudfront CDN" },
  { pattern: /akamai\.net$/, label: "Akamai CDN" },
  { pattern: /cloudflare\.com$/, label: "Cloudflare" },
  { pattern: /slack\.com$/, label: "Slack" },
  { pattern: /discord\.com$/, label: "Discord" },
  { pattern: /spotify\.com$/, label: "Spotify" },
];

const ASN_RULES = {
  "15169": { label: "Google", isCloud: false },
  "32934": { label: "Meta", isCloud: false },
  "16509": { label: "Amazon / AWS", isCloud: true },
  "13335": { label: "Cloudflare", isCloud: true },
  "8075": { label: "Microsoft", isCloud: true },
  "20940": { label: "Akamai", isCloud: true },
  "2906": { label: "Netflix", isCloud: false },
  "132203": { label: "Tencent", isCloud: true },
  "136907": { label: "Alibaba", isCloud: true },
};

const CLOUD_ORGS = [
  "AMAZON", "AWS", "GOOGLE CLOUD", "MICROSOFT AZURE", "CLOUDFLARE", "AKAMAI", "DIGITALOCEAN", "LINODE", "OVH"
];

export function classifyService(hostname = "", asn = "", organization = "") {
  // 1. Check Domain Rules
  if (hostname) {
    for (const rule of DOMAIN_RULES) {
      if (rule.pattern.test(hostname)) {
        return { label: rule.label, isCloud: false };
      }
    }
  }

  // 2. Check ASN Rules
  if (asn && ASN_RULES[asn]) {
    return ASN_RULES[asn];
  }

  // 3. Fallback to Organization string analysis
  if (organization) {
    const orgUpper = organization.toUpperCase();
    
    // Check if it's a known cloud provider
    const isCloud = CLOUD_ORGS.some(cloud => orgUpper.includes(cloud));
    
    // Clean up the org name for display (remove common noise)
    let label = organization
      .replace(/,?\s*(INC|LLC|CORP|LTD|GMBH|S\.A)\.?/gi, "")
      .replace(/\s+/g, " ")
      .trim();

    return { label, isCloud };
  }

  return { label: null, isCloud: false };
}
