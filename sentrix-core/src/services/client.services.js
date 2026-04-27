import { Client } from "../models/client.model.js";
import { log, formatResponse } from "../utils/logger.utils.js";

const clients = new Map();

export function getAllClients() {
  if (clients.size === 0) {
    return formatResponse(false, "user doesn't exist", null, "NOT_FOUND");
  } else {
    const clientLists = Object.fromEntries(clients);
    return clientLists;
  }
}

export function addToClients(clientData) {
  console.log(clientData);
  if (clients.has(clientData.id)) {
    return formatResponse(false, "user already exist", null, "DUPLICATE_ENTRY");
  } else {
    try {
      const client = new Client(
        clientData.id,
        clientData.name,
        clientData.cpu,
        clientData.ram,
      );
      console.log(client);
      clients.set(clientData.id, client);
      return formatResponse(true, "added new user", client.name, null);
    } catch (error) {
      return formatResponse(false, `Error: ${error}`, null, error);
    }
  }
}
