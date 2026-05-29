import net from "net";

/**
 * Sends a JSON payload to a local TCP server.
 * @param {number} port 
 * @param {Object} payload 
 * @returns {Promise<boolean>}
 */
export async function sendMessage(port, payload) {
  return new Promise((resolve) => {
    const client = new net.Socket();
    let resolved = false;

    client.setTimeout(2000);

    client.connect(port, "127.0.0.1", () => {
      client.write(JSON.stringify(payload));
      client.end();
    });

    client.on("data", () => {
      if (!resolved) {
        resolved = true;
        resolve(true);
      }
    });

    client.on("end", () => {
      if (!resolved) {
        resolved = true;
        resolve(true);
      }
    });

    client.on("error", () => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });

    client.on("timeout", () => {
      client.destroy();
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    });
  });
}

/**
 * Starts a TCP server to listen for incoming JSON payloads.
 * @param {number} port 
 * @param {Function} callback 
 */
export function listenForMessages(port, callback) {
  const server = net.createServer((socket) => {
    socket.on("data", (data) => {
      try {
        const payload = JSON.parse(data.toString());
        callback(payload);
        socket.write("ok");
      } catch (err) {
        console.error("[IPC] Failed to parse message:", err);
      }
    });

    socket.on("error", (err) => {
      console.error("[IPC] Socket error:", err);
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[IPC] Listening on port ${port}`);
  });

  return server;
}
