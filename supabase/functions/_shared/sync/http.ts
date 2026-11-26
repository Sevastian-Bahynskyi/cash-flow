// JSON responses with CORS for the web app's origin (bank-sync, bank-consent).
const corsHeaders = (): Record<string, string> => ({
  "Access-Control-Allow-Origin": Deno.env.get("PUBLIC_APP_URL") ?? "http://localhost:3000",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin",
});

export const preflight = (): Response => new Response(null, { status: 204, headers: corsHeaders() });

export const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders(), "Content-Type": "application/json" } });
