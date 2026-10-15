import bcrypt from "bcryptjs";
import { v4 as uuidv4 } from "uuid";
import { UsersRepository } from "./users.repository.js";

export async function getUserByEmail(email) {
  return UsersRepository.findByEmail(email);
}

export async function getUserForAuth(email) {
  return UsersRepository.findForAuth(email);
}

export async function getUserById(id) {
  return UsersRepository.findById(id);
}

export async function getAllAdmins() {
  return UsersRepository.findAll();
}

export async function countUsers() {
  return UsersRepository.count();
}

export async function createUser({ email, password, role }) {
  if (!email || !password) {
    throw new Error("Email and password are required.");
  }

  if (!["admin", "network_admin"].includes(role)) {
    throw new Error("Invalid user role.");
  }

  const id = uuidv4();
  const now = Date.now();
  const passwordHash = await bcrypt.hash(password, 10);

  await UsersRepository.insert({ id, email, passwordHash, role, now });

  return getUserById(id);
}

export async function deleteUser(id) {
  return UsersRepository.deleteById(id);
}

export async function validatePassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

export async function updateUserPassword(id, currentPassword, nextPassword) {
  if (!nextPassword || nextPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  const user = await UsersRepository.findRawById(id);

  if (!user) {
    throw new Error("User not found.");
  }

  if (!(await validatePassword(user, currentPassword))) {
    throw new Error("Current password is incorrect.");
  }

  const passwordHash = await bcrypt.hash(nextPassword, 10);
  await UsersRepository.updatePassword(id, passwordHash, Date.now());

  return getUserById(id);
}

export async function seedInitialAdmin({ email, password }) {
  const total = await countUsers();
  if (total > 0) {
    return null;
  }

  const id = uuidv4();
  const now = Date.now();
  const passwordHash = await bcrypt.hash(password, 10);

  await UsersRepository.insert({
    id,
    email,
    passwordHash,
    role: "network_admin",
    now,
  });

  return getUserById(id);
}
