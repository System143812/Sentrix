import { Server } from "socket.io";
import http from "http";

const server = http.createServer();
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  const role = socket.handshake.query.role;
  console.log(`[Mock Core] ${role} connected: ${socket.id}`);

  if (role === "agent") {
    socket.on("agent:register", async (profile) => {
      console.log(`[Mock Core] Agent registered: ${profile.hostname} (${profile.agentId})`);
      
      const actions = [
        { command: "utility:broadcast-message", args: { text: "Testing all controls..." } },
        { command: "utility:network-reset" },
        { command: "utility:system-purge" },
        { command: "utility:time-sync" },
        { command: "utility:workspace-reset" }
      ];

      for (const action of actions) {
        console.log(`[Mock Core] Sending command: ${action.command}...`);
        try {
          const response = await socket.timeout(10000).emitWithAck("agent:command", action);
          console.log(`[Mock Core] Agent response for ${action.command}:`, response);
        } catch (err) {
          console.error(`[Mock Core] Command ${action.command} timed out or failed:`, err.message);
        }
        // Small delay between commands
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log("[Mock Core] All tests completed.");
      process.exit(0);
    });
  }
});

const PORT = 4001;
const HOST = "127.0.0.1";
server.listen(PORT, HOST, () => {
  console.log(`[Mock Core] Listening on https://${HOST}:${PORT}`);
});
