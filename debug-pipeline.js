import { io } from "socket.io-client";
import path from "path";
import fs from "fs";

const socket = io("http://localhost:4000");

socket.on("connect", () => {
  console.log("Connected to core for testing");
  
  // Register as an agent
  socket.emit("agent:register", {
    agentId: "test-agent-debug",
    hostname: "DEBUG-PC",
    mac: "00:00:00:00:00:00"
  }, (response) => {
    console.log("Registration response:", response);
    
    if (response.success) {
      console.log("Test agent registered. Sending broadcast command to self...");
      
      // We simulate the core sending a command to this agent
      // In a real scenario, the dashboard hits an API, which emits to the agent.
      // Here we just test the agent-side handler directly.
    }
  });
});

socket.on("agent:command", async (payload, callback) => {
  console.log("Received command:", payload);
  // This mimics the logic in socket.service.js
  const { command, args } = payload;
  if (command.startsWith("utility:broadcast-message")) {
    console.log("Simulating broadcast-message execution...");
    // We can't easily run the full maintenance.js here without setup, 
    // but we can log what it would do.
  }
  callback?.({ success: true, message: "Debug command received" });
});

setTimeout(() => {
  console.log("Test finished.");
  process.exit(0);
}, 10000);
