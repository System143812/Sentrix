import { v4 as uuidv4 } from "uuid";
import { GroupsRepository } from "./groups.repository.js";

function normalizeGroupName(name) {
  return String(name || "").trim();
}

function assertGroupName(name) {
  if (!name) {
    throw new Error("Group name is required.");
  }
}

export async function getAllGroups() {
  return GroupsRepository.findAll();
}

export async function getGroupById(id) {
  return GroupsRepository.findById(id);
}

export async function createGroup({ name, description }) {
  const normalizedName = normalizeGroupName(name);
  assertGroupName(normalizedName);

  const id = uuidv4();
  const now = Date.now();

  await GroupsRepository.insert({
    id,
    name: normalizedName,
    description: description || "",
    now,
  });

  return getGroupById(id);
}

export async function updateGroup(id, { name, description }) {
  const normalizedName = normalizeGroupName(name);
  assertGroupName(normalizedName);

  await GroupsRepository.update(id, {
    name: normalizedName,
    description: description || "",
    now: Date.now(),
  });

  return getGroupById(id);
}

export async function deleteGroup(id) {
  return GroupsRepository.deleteById(id);
}

export async function resetClientsGroup(name) {
  return GroupsRepository.resetClientsGroup(name);
}

export async function renameClientsGroup(oldName, newName) {
  return GroupsRepository.renameClientsGroup(oldName, newName);
}
