import { describe, it, expect } from "vitest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getOrCreateRootCA, getOrCreateServerCertificate } from "../../src/lib/cert-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const certDir = path.resolve(__dirname, "../../.certs");

describe("CertManager", () => {
  it("generates or loads a valid Root CA", async () => {
    const ca = await getOrCreateRootCA();
    expect(ca.key).toBeTypeOf("string");
    expect(ca.cert).toBeTypeOf("string");

    const caCert = new crypto.X509Certificate(ca.cert);
    expect(caCert.subject).include("Sentrix Root CA");
    expect(caCert.issuer).include("Sentrix Root CA"); // Self-signed root CA
  });

  it("generates a server certificate signed by Root CA with correct SANs", async () => {
    const testIps = ["192.168.1.100", "10.0.0.5"];
    const serverPems = await getOrCreateServerCertificate(testIps);

    expect(serverPems.key).toBeTypeOf("string");
    expect(serverPems.cert).toBeTypeOf("string");

    const serverCert = new crypto.X509Certificate(serverPems.cert);
    const ca = await getOrCreateRootCA();
    const caCert = new crypto.X509Certificate(ca.cert);

    // Verify server cert is signed by Root CA
    expect(serverCert.issuer).include("Sentrix Root CA");
    expect(serverCert.subject).include("sentrix.local");
    expect(serverCert.verify(caCert.publicKey)).toBe(true);

    // Verify SANs
    const san = serverCert.subjectAltName;
    expect(san).include("DNS:localhost");
    expect(san).include("DNS:sentrix.local");
    expect(san).include("IP Address:192.168.1.100");
    expect(san).include("IP Address:10.0.0.5");
  });
});
