import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";
import selfsigned from "selfsigned";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certDir = path.resolve(__dirname, "../../.certs");

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = ["127.0.0.1", "0.0.0.0"];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name]) {
      if (net.family === "IPv4" && !net.internal) {
        if (!ips.includes(net.address)) {
          ips.push(net.address);
        }
      }
    }
  }
  return ips;
}

/**
 * Ensures a persistent Root CA exists, generating one if necessary.
 */
export async function getOrCreateRootCA() {
  const caKeyPath = path.join(certDir, "root-ca.key");
  const caCertPath = path.join(certDir, "root-ca.crt");

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  if (fs.existsSync(caKeyPath) && fs.existsSync(caCertPath)) {
    return {
      key: fs.readFileSync(caKeyPath, "utf8"),
      cert: fs.readFileSync(caCertPath, "utf8"),
    };
  }

  console.log("[CertManager] Generating new persistent Sentrix Root CA...");
  const pems = await selfsigned.generate(
    [
      { name: "commonName", value: "Sentrix Root CA" },
      { name: "organizationName", value: "Sentrix Security PKI" },
    ],
    {
      days: 3650, // 10 years validity for Root CA
      algorithm: "sha256",
      extensions: [
        {
          name: "basicConstraints",
          cA: true,
          critical: true,
        },
        {
          name: "keyUsage",
          keyCertSign: true,
          cRLSign: true,
          critical: true,
        },
      ],
    }
  );

  fs.writeFileSync(caKeyPath, pems.private, "utf8");
  fs.writeFileSync(caCertPath, pems.cert, "utf8");
  console.log("[CertManager] Persistent Sentrix Root CA generated successfully.");

  return {
    key: pems.private,
    cert: pems.cert,
  };
}

/**
 * Gets or generates a server TLS certificate signed by the Root CA,
 * incorporating all current local IPs and Tailscale IPs into SANs.
 */
export async function getOrCreateServerCertificate(localIps = getLocalIpAddresses()) {
  const keyPath = path.join(certDir, "server.key");
  const certPath = path.join(certDir, "server.crt");

  if (!fs.existsSync(certDir)) {
    fs.mkdirSync(certDir, { recursive: true });
  }

  const ca = await getOrCreateRootCA();

  console.log(`[CertManager] Generating/Refreshing server TLS certificate signed by Root CA with SANs for: ${localIps.join(", ")}...`);

  const attrs = [{ name: "commonName", value: "sentrix.local" }];

  const altNames = [
    { type: 2, value: "localhost" },
    { type: 2, value: "sentrix.local" },
    ...localIps.map((ip) => ({ type: 7, ip })),
  ];

  const pems = await selfsigned.generate(attrs, {
    days: 365,
    algorithm: "sha256",
    ca: {
      key: ca.key,
      cert: ca.cert,
    },
    extensions: [
      {
        name: "subjectAltName",
        altNames,
      },
      {
        name: "extendedKeyUsage",
        serverAuth: true,
        clientAuth: true,
      },
    ],
  });

  fs.writeFileSync(keyPath, pems.private, "utf8");
  fs.writeFileSync(certPath, pems.cert, "utf8");
  console.log("[CertManager] Server TLS certificate successfully generated and signed by Root CA.");

  return {
    key: pems.private,
    cert: pems.cert,
  };
}
