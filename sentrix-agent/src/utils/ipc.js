import net from "net";

const MAX_PAYLOAD_SIZE = 1024 * 1024; // 1 MiB
const SOCKET_TIMEOUT_MS = 30000;

/**
 * Sends a JSON payload to a local TCP server and waits for structured response.
 * @param {number} port
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
export async function sendMessage(port, payload) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let resolved = false;
    const responseChunks = [];
    let totalResponseBytes = 0;

    client.setTimeout(SOCKET_TIMEOUT_MS);

    client.connect(port, "127.0.0.1", () => {
      try {
        const jsonStr = JSON.stringify(payload);
        const requestBuffer = Buffer.from(jsonStr, "utf8");

        if (requestBuffer.length > MAX_PAYLOAD_SIZE) {
          if (!resolved) {
            resolved = true;
            client.destroy();
            resolve({ success: false, error: "Request payload exceeded maximum allowed size" });
          }
          return;
        }

        client.end(requestBuffer);
      } catch (err) {
        if (!resolved) {
          resolved = true;
          client.destroy();
          resolve({ success: false, error: `Failed to serialize payload: ${err.message}` });
        }
      }
    });

    client.on("data", (chunk) => {
      totalResponseBytes += chunk.length;
      if (totalResponseBytes > MAX_PAYLOAD_SIZE) {
        if (!resolved) {
          resolved = true;
          client.destroy();
          resolve({ success: false, error: "Response payload exceeded maximum allowed size" });
        }
        return;
      }
      responseChunks.push(chunk);
    });

    client.on("end", () => {
      if (!resolved) {
        resolved = true;
        try {
          const responseBuffer = Buffer.concat(responseChunks);
          const responseStr = responseBuffer.toString("utf8").trim();
          const parsed = JSON.parse(responseStr);

          if (
            parsed &&
            typeof parsed === "object" &&
            !Array.isArray(parsed) &&
            typeof parsed.success === "boolean"
          ) {
            resolve(parsed);
          } else {
            resolve({
              success: false,
              error: "Invalid response format"
            });
          }
        } catch (err) {
          const raw = Buffer.concat(responseChunks).toString("utf8");
          resolve({ success: false, error: `Failed to parse response JSON: ${err.message}`, raw });
        }
      }
    });

    client.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: `Socket error: ${err.message}` });
      }
    });

    client.on("timeout", () => {
      client.destroy();
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: "Socket connection timed out" });
      }
    });
  });
}

/**
 * Starts a TCP server to listen for incoming JSON payloads with proper framing and UTF-8 safety.
 * @param {number} port
 * @param {Function} callback - function(payload, reply) or async function(payload, reply)
 * @param {Object} options
 */
export function listenForMessages(port, callback, options = {}) {
  const server = net.createServer({ allowHalfOpen: true }, (socket) => {
    const requestChunks = [];
    let totalRequestBytes = 0;
    let settled = false;

    socket.setTimeout(SOCKET_TIMEOUT_MS);

    socket.on("data", (chunk) => {
      if (settled) return;

      totalRequestBytes += chunk.length;
      if (totalRequestBytes > MAX_PAYLOAD_SIZE) {
        settled = true;
        try {
          const errRes = JSON.stringify({ success: false, error: "Request payload exceeded 1 MiB limit" });
          socket.end(Buffer.from(errRes, "utf8"), () => {
            socket.destroy();
          });
        } catch {
          socket.destroy();
        }
        return;
      }
      requestChunks.push(chunk);
    });

    socket.on("end", async () => {
      if (settled) return;
      settled = true;

      let replied = false;
      const reply = (res, onFlushed) => {
        if (replied) return;
        replied = true;
        try {
          let responseObj;

          if (
            res &&
            typeof res === "object" &&
            !Array.isArray(res)
          ) {
            responseObj = typeof res.success === "boolean"
              ? res
              : { success: false, error: "Invalid response format" };
          } else {
            responseObj = { success: true, result: res };
          }

          const out = JSON.stringify(responseObj);
          const responseBuffer = Buffer.from(out, "utf8");

          if (responseBuffer.length > MAX_PAYLOAD_SIZE) {
            try { socket.destroy(); } catch {}
            return;
          }

          socket.end(responseBuffer, () => {
            onFlushed?.();
          });
        } catch (e) {
          // Serialization or write failure: never invoke onFlushed
          try { socket.destroy(); } catch {}
        }
      };

      try {
        const requestBuffer = Buffer.concat(requestChunks);
        const trimmed = requestBuffer.toString("utf8").trim();
        if (!trimmed) {
          reply({ success: false, error: "Empty request payload" });
          return;
        }

        const payload = JSON.parse(trimmed);
        const result = await callback(payload, reply);
        if (!replied) {
          reply(result !== undefined ? result : { success: true });
        }
      } catch (err) {
        console.error("[IPC] Failed to parse request message:", err);
        reply({ success: false, error: `Invalid JSON request: ${err.message}` });
      }
    });

    socket.on("error", (err) => {
      console.error("[IPC] Socket error:", err);
    });

    socket.on("timeout", () => {
      try {
        socket.destroy();
      } catch {}
    });
  });

  server.on("error", (err) => {
    if (typeof options.onError === "function") {
      options.onError(err);
      return;
    }

    console.error("[IPC] Server error:", err);
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[IPC] Listening on port ${port}`);
  });

  return server;
}
