import * as clientService from "../services/client.services.js";

export function getAllClients(req, res) {
  const clients = clientService.getAllClients();
  res.send(clients);
}

export function addToClients(req, res) {
  const data = req.body;
  res.send(clientService.addToClients(data));
}
