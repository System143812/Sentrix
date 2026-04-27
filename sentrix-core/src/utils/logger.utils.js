export function log(message) {
  console.log(`${message}`);
}

export function formatResponse(status, message, data = null, error = null) {
  return { status, message, data, error };
}
