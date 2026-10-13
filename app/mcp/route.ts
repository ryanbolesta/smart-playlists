import { syncScheduledRecentlyLiked } from "../../lib/recently-liked-sync";
import { syncScheduledLostAndFound } from "../../lib/lost-and-found-sync";

export const dynamic = "force-dynamic";
const tools = [{ name: "sync_recently_liked_playlists", description: "Synchronize every existing managed playlist configured in Smart Playlists.", inputSchema: { type: "object", properties: {}, additionalProperties: false } }];

export async function POST(request: Request) {
  let rpc: { id?: string | number | null; method?: string; params?: { name?: string } };
  try { rpc = await request.json(); } catch { return Response.json(jsonRpcError(null, -32700, "Invalid JSON."), { status: 400 }); }
  const id = rpc.id ?? null;
  if (rpc.method === "server/discover") return Response.json(jsonRpcResult(id, { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } }));
  if (rpc.method === "tools/list") return Response.json(jsonRpcResult(id, { tools }));
  if (rpc.method === "tools/call") {
    if (rpc.params?.name !== "sync_recently_liked_playlists" && rpc.params?.name !== "sync_managed_playlists") return Response.json(jsonRpcError(id, -32601, "Unknown tool."), { status: 404 });
    try {
      const [recentlyLiked, lostAndFound] = await Promise.all([syncScheduledRecentlyLiked(request), syncScheduledLostAndFound(request)]);
      return Response.json(jsonRpcResult(id, { content: [{ type: "text", text: `Managed playlist sync complete: Recently Liked ${recentlyLiked.synced} synced, Lost & Found ${lostAndFound.synced} synced, ${recentlyLiked.failed + lostAndFound.failed} failed.` }] }));
    } catch (error) {
      return Response.json(jsonRpcResult(id, { content: [{ type: "text", text: error instanceof Error ? error.message : "Could not run the scheduled sync." }], isError: true }));
    }
  }
  return Response.json(jsonRpcError(id, -32601, "Method not found."), { status: 404 });
}
function jsonRpcResult(id: string | number | null, result: unknown) { return { jsonrpc: "2.0", id, result }; }
function jsonRpcError(id: string | number | null, code: number, message: string) { return { jsonrpc: "2.0", id, error: { code, message } }; }
