/**
 * Standard CORS header set used by every adapter. `methods` lets each platform
 * advertise the verbs it actually supports without re-declaring the rest.
 */
export function corsHeaders(methods: string = 'GET, POST, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

export function jsonHeaders(extra?: Record<string, string>): Record<string, string> {
  return { 'Content-Type': 'application/json', ...extra };
}
