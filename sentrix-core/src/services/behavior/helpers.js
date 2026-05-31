import crypto from "crypto";

export function normalizeString(value, fallback = "") {
  return String(value ?? fallback).trim();
}

export function classifyDomain(domain = "") {
  const value = domain.toLowerCase();
  if (/youtube|tiktok|netflix|spotify/.test(value)) return "media";
  if (/discord|facebook|instagram|messenger|telegram/.test(value)) return "social";
  if (/steam|epicgames|riotgames|roblox/.test(value)) return "gaming";
  if (/github|gitlab|npmjs|microsoft|stackoverflow/.test(value)) return "developer";
  if (/google|cloudflare|akamai|amazonaws|azure/.test(value)) return "cloud";
  return "uncategorized";
}
