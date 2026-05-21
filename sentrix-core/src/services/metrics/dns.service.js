import { promises as dnsPromises } from "dns";
import pool from "../../lib/database.js";
import { log } from "../../utils/logger.utils.js";
import { classifyService } from "./classification.js";

const MEMORY_CACHE = new Map();
const RESOLUTION_QUEUE = new Set();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Service to manage global IP-to-hostname intelligence.
 */
export const DnsService = {
  /**
   * Resolve an IP to a hostname using Memory -> DB -> Live DNS.
   * Now also enriches with ASN and Service classification.
   */
  async resolveIp(ip) {
    if (!ip || ip === "localhost" || ip.includes(":") || ip === "127.0.0.1") {
      return null;
    }

    // 1. Memory Cache
    if (MEMORY_CACHE.has(ip)) {
      return MEMORY_CACHE.get(ip);
    }

    try {
      // 2. Database Cache
      const [rows] = await pool.query(
        "SELECT hostname, service_label, last_verified_at FROM dns_intelligence WHERE ip = ? LIMIT 1",
        [ip]
      );

      if (rows.length > 0) {
        const { hostname, service_label, last_verified_at } = rows[0];
        const displayLabel = service_label || hostname;
        MEMORY_CACHE.set(ip, displayLabel);

        // If stale, queue for background refresh
        if (Date.now() - Number(last_verified_at) > CACHE_TTL_MS) {
          this.queueForResolution(ip);
        }

        return displayLabel;
      }

      // 3. New IP: Queue for resolution
      this.queueForResolution(ip);
      return null;
    } catch (err) {
      log(`DNS Service error for ${ip}: ${err.message}`);
      return null;
    }
  },

  /**
   * Add an IP to the background resolution queue.
   */
  queueForResolution(ip) {
    if (RESOLUTION_QUEUE.has(ip)) return;
    RESOLUTION_QUEUE.add(ip);
    setImmediate(() => this.processQueue());
  },

  /**
   * Process the resolution queue until empty.
   */
  async processQueue() {
    if (RESOLUTION_QUEUE.size === 0 || this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (RESOLUTION_QUEUE.size > 0) {
        const ips = Array.from(RESOLUTION_QUEUE).slice(0, 20); // Larger batch size
        ips.forEach(ip => RESOLUTION_QUEUE.delete(ip));

        await Promise.allSettled(ips.map(ip => this.performFullEnrichment(ip)));
        
        // Brief pause to prevent CPU spike during massive queues
        if (RESOLUTION_QUEUE.size > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    } finally {
      this.isProcessing = false;
    }
  },

  /**
   * Full Enrichment Pipeline: PTR -> Forward Verify -> ASN -> Classification -> Store
   */
  async performFullEnrichment(ip) {
    try {
      // 1. PTR Lookup (Reverse DNS)
      let hostname = null;
      try {
        const hostnames = await dnsPromises.reverse(ip);
        if (hostnames && hostnames.length > 0) {
          hostname = hostnames[0].toLowerCase();
        }
      } catch (e) {}

      // 2. ASN & Organization Lookup (Team Cymru DNS WHOIS)
      const networkData = await this.lookupAsn(ip);
      
      // 3. Forward Verification
      let forwardVerified = false;
      if (hostname) {
        forwardVerified = await this.verifyForward(hostname, ip);
      }

      // 4. Classification
      const classification = classifyService(hostname, networkData.asn, networkData.org);

      // 5. Store result
      await this.storeResolution(ip, {
        hostname: hostname || ip,
        asn: networkData.asn,
        organization: networkData.org,
        serviceLabel: classification.label,
        isCloud: classification.isCloud,
        forwardVerified
      });

      return hostname || ip;
    } catch (err) {
      log(`Enrichment failed for ${ip}: ${err.message}`);
    }
    return null;
  },

  /**
   * Verify if hostname points back to the expected IP.
   */
  async verifyForward(hostname, expectedIp) {
    try {
      const addresses = await dnsPromises.resolve4(hostname);
      return addresses.includes(expectedIp);
    } catch (e) {
      return false;
    }
  },

  /**
   * Lookup ASN and Organization using Team Cymru DNS WHOIS.
   */
  async lookupAsn(ip) {
    const result = { asn: null, org: null };
    try {
      const reversedIp = ip.split(".").reverse().join(".");
      const originQuery = `${reversedIp}.origin.asn.cymru.com`;
      
      const originTxt = await dnsPromises.resolveTxt(originQuery);
      if (originTxt && originTxt.length > 0) {
        const parts = originTxt[0][0].split("|").map(s => s.trim());
        result.asn = parts[0];

        // Now lookup the ASN details (Org name)
        const asnQuery = `AS${result.asn}.asn.cymru.com`;
        const asnTxt = await dnsPromises.resolveTxt(asnQuery);
        if (asnTxt && asnTxt.length > 0) {
          const asnParts = asnTxt[0][0].split("|").map(s => s.trim());
          result.org = asnParts[4]; // The organization name is typically the 5th field
        }
      }
    } catch (e) {}
    return result;
  },

  /**
   * Save resolution with full metadata to DB and Memory.
   */
  async storeResolution(ip, data, source = "live_dns") {
    const now = Date.now();
    try {
      await pool.query(
        `
        INSERT INTO dns_intelligence 
          (ip, hostname, asn, organization, service_label, forward_verified, is_cloud, first_seen_at, last_verified_at, source, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid')
        ON DUPLICATE KEY UPDATE
          hostname = VALUES(hostname),
          asn = VALUES(asn),
          organization = VALUES(organization),
          service_label = VALUES(service_label),
          forward_verified = VALUES(forward_verified),
          is_cloud = VALUES(is_cloud),
          last_verified_at = VALUES(last_verified_at),
          source = VALUES(source),
          status = 'valid'
        `,
        [
          ip, 
          data.hostname, 
          data.asn, 
          data.organization, 
          data.serviceLabel, 
          data.forwardVerified ? 1 : 0, 
          data.isCloud ? 1 : 0, 
          now, 
          now, 
          source
        ]
      );
      
      const displayLabel = data.serviceLabel || data.hostname;
      MEMORY_CACHE.set(ip, displayLabel);
    } catch (err) {
      log(`Failed to store enriched resolution for ${ip}: ${err.message}`);
    }
  }
};
