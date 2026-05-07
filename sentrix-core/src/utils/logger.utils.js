export function log(message) {
  console.log(`${message}`);
} //nonsense to

export function formatResponse(success, message, data = null, error = null) {
  return { success, message, data, error };
}
