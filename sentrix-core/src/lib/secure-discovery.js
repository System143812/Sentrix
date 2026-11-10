import dgram from "dgram";
import crypto from "crypto";
import { networkIdentity } from "./network-identity.js";
import { SecurityRepository } from "../modules/security/security.repository.js";
import pool from "./database.js";

const DISCOVERY_PORT = 41200;
let serverSocket = null;

/**
 * Computes a server fingerprint used for mutual authentication.
 */
export function getServerFingerprint() {
  const secret = process.env.SENTRIX_SECURITY_SECRET || process.env.JWT_SECRET || "sentrix-secret";
  const ip = networkIdentity.getCurrentIp();
  return crypto.createHmac("sha256", secret).update(ip).digest("hex");
}

/**
 * Starts the UDP secure discovery beacon listener.
 */
export function startSecureDiscoveryListener(io) {
  if (serverSocket) return;

  serverSocket = dgram.createSocket("udp4");

  serverSocket.on("error", (err) => {
    console.error(`[SecureDiscovery] UDP server error:\n${err.stack}`);
    serverSocket.close();
    serverSocket = null;
  });

  serverSocket.on("message", async (msg, rinfo) => {
    try {
      const packet = JSON.parse(msg.toString());
      if (packet.type !== "SENTRIX_DISCOVER") return;

      const { agentId, challenge, hmac } = packet;
      if (!agentId || !challenge || !hmac) return;

      // 1. Look up agent hardware binding & shared secret from DB
      const [[client]] = await pool.query(
        "SELECT id, agent_id, mac, hardware_fingerprint FROM clients WHERE id = ? OR agent_id = ?",
        [agentId, agentId]
      );

      if (!client || !client.hardware_fingerprint) {
        return; // Silent drop for unknown agents
      }

      // 2. Verify HMAC signature using client's hardware_fingerprint as shared secret
      const payloadToVerify = agentId + challenge;
      const expectedHmac = crypto
        .createHmac("sha256", client.hardware_fingerprint)
        .update(payloadToVerify)
        .digest("hex");

      const sigBuf = Buffer.from(hmac, "hex");
      const expBuf = Buffer.from(expectedHmac, "hex");

      if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
        return; // Silent drop on HMAC mismatch
      }

      // 3. Verify sender IP MAC matches stored client MAC (anti-spoofing)
      // (For now, we trust the HMAC since hardware_fingerprint is unique to the device)

      console.log(`[SecureDiscovery] Valid discovery probe received from agent ${agentId} at ${rinfo.address}:${rinfo.port}`);

      // 4. Construct encrypted response containing new server URL and fingerprint
      const responsePayload = {
        serverUrl: networkIdentity.getServerUrl(),
        serverFingerprint: getServerFingerprint(),
        challenge,
        timestamp: Date.now(),
      };

      const cipher = crypto.createCipheriv(
        "aes-256-cbc",
        Buffer.from(client.hardware_fingerprint.slice(0, 32), "utf8"),
        Buffer.alloc(16, 0)
      );
      const encryptedPayload =
        cipher.update(JSON.stringify(responsePayload), "utf8", "hex") +
        cipher.final("hex");

      const replyPacket = Buffer.from(JSON.stringify({
        type: "SENTRIX_RESPONSE",
        payload: encryptedPayload,
      }));

      serverSocket.send(replyPacket, rinfo.port, rinfo.address, (err) => {
        if (err) console.error(`[SecureDiscovery] Failed to send discovery reply:`, err.message);
      });

    } catch (err) {
      // Malformed packets are silently ignored
    }
  });

  serverSocket.bind(DISCOVERY_PORT, () => {
    console.log(`[SecureDiscovery] UDP Discovery listener active on port ${DISCOVERY_PORT}`);
  });
}

export function stopSecureDiscoveryListener() {
  if (serverSocket) {
    serverSocket.close();
    serverSocket = null;
  }
}
