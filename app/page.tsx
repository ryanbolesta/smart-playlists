"use client";

import { Check, ChevronRight, Disc3, History, LibraryBig, LoaderCircle, Plus, RefreshCw, Sparkles, X } from "lucide-react";
import { useEffect, useState } from "react";

const playlists = [
  { id: "recently-added", title: "Recently Liked", description: "Songs you liked in the last 30 days, kept in the order you found them.", icon: Plus },
  { id: "lost-and-found", title: "Lost & Found", description: "Older favorites, resurfaced when they have room to surprise you.", icon: Sparkles },
  { id: "time-capsule", title: "Time Capsule", description: "Songs you liked around this time in past years.", icon: History },
  { id: "recently-played", title: "Recently Played", description: "The tracks you have played lately, without duplicates.", icon: LibraryBig },
] as const;

type Screen = "checking" | "disconnected" | "setup" | "ready";
type SpotifyProfile = { displayName: string | null; imageUrl: string | null };
type RecentlyAddedSync = { lastSyncedAt: string | null; trackCount: number; playlistUrl: string | null };

export default function Home() {
  const [screen, setScreen] = useState<Screen>("checking");
  const [selectedIds, setSelectedIds] = useState<string[]>(["recently-added"]);
  const [profile, setProfile] = useState<SpotifyProfile>({ displayName: null, imageUrl: null });
  const [isConnectOpen, setIsConnectOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [recentlyAddedSync, setRecentlyAddedSync] = useState<RecentlyAddedSync | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/spotify/status")
      .then((response) => response.json())
      .then((data: { connected?: boolean; displayName?: string | null; imageUrl?: string | null; hasConfiguredPlaylists?: boolean; selectedPlaylistIds?: string[]; recentlyAdded?: RecentlyAddedSync | null }) => {
        if (!active) return;
        setProfile({ displayName: data.displayName ?? null, imageUrl: data.imageUrl ?? null });
        if (!data.connected) return setScreen("disconnected");
        setSelectedIds(data.selectedPlaylistIds?.length ? data.selectedPlaylistIds : ["recently-added"]);
        setRecentlyAddedSync(data.recentlyAdded ?? null);
        setScreen(data.hasConfiguredPlaylists ? "ready" : "setup");
      })
      .catch(() => active && setScreen("disconnected"));
    return () => { active = false; };
  }, []);

  const selectedPlaylists = playlists.filter((playlist) => selectedIds.includes(playlist.id));

  function togglePlaylist(id: string) {
    setSaveError(null);
    setSelectedIds((current) => current.includes(id) ? current.filter((playlistId) => playlistId !== id) : [...current, id]);
  }

  async function saveChoices() {
    if (selectedIds.length === 0) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/playlist-preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ selectedPlaylistIds: selectedIds }) });
      const data = (await response.json()) as { error?: string; selectedPlaylistIds?: string[] };
      if (!response.ok) throw new Error(data.error ?? "Could not save playlist choices.");
      setSelectedIds(data.selectedPlaylistIds ?? selectedIds);
      setScreen("ready");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save playlist choices.");
    } finally {
      setIsSaving(false);
    }
  }

  async function syncRecentlyAdded() {
    setIsSyncing(true);
    setSyncError(null);
    try {
      const response = await fetch("/api/playlists/recently-added/sync", { method: "POST" });
      const data = (await response.json()) as { error?: string; trackCount?: number; syncedAt?: string; playlistUrl?: string | null };
      if (!response.ok || !data.syncedAt || typeof data.trackCount !== "number") {
        throw new Error(data.error ?? "Could not sync Recently Liked.");
      }
      setRecentlyAddedSync({ lastSyncedAt: data.syncedAt, trackCount: data.trackCount, playlistUrl: data.playlistUrl ?? null });
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : "Could not sync Recently Liked.");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_8%_0%,rgba(94,219,248,.28),transparent_31%),radial-gradient(circle_at_95%_18%,rgba(178,225,255,.2),transparent_25%),linear-gradient(145deg,#243845_0%,#121e27_57%,#091116_100%)] font-['Lucida_Grande','Trebuchet_MS',Arial,sans-serif] text-[#f5fdff] selection:bg-[#8fefff] selection:text-[#11242e]">
      <header className="relative mx-auto flex max-w-4xl items-center justify-between px-6 py-6 sm:py-8">
        <a className="flex items-center gap-3 text-[#f5fdff]" href="#top" aria-label="Smart Playlists home"><span className="grid h-10 w-10 place-items-center rounded-full border border-[#0a87b8] bg-[radial-gradient(circle_at_34%_24%,#efffff_0_8%,transparent_9%),linear-gradient(#bdf7ff,#38c6ec_47%,#0984bf)] text-white shadow-[inset_0_1px_rgba(255,255,255,.85),0_2px_6px_rgba(0,0,0,.35)]"><Disc3 size={20} strokeWidth={2.25} /></span><span className="text-[15px] font-semibold tracking-[-0.03em]">Smart Playlists</span></a>
        {screen === "ready" && <ProfileBadge profile={profile} />}
      </header>

      <section id="top" className="relative mx-auto flex min-h-[calc(100vh-104px)] max-w-4xl items-center px-6 pb-16">
        {screen === "checking" ? (
          <div className="mx-auto flex items-center gap-3 text-sm text-white/75"><LoaderCircle size={18} className="animate-spin text-[#8fefff]" /> Checking your Spotify connection</div>
        ) : screen === "disconnected" ? (
          <div className="mx-auto w-full max-w-xl text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full border border-[#0a87b8] bg-[radial-gradient(circle_at_34%_24%,#efffff_0_8%,transparent_9%),linear-gradient(#bdf7ff,#38c6ec_47%,#0984bf)] text-white shadow-[inset_0_1px_rgba(255,255,255,.85),0_3px_9px_rgba(0,0,0,.35)]"><Disc3 size={27} /></span>
            <p className="mt-8 text-xs font-medium uppercase tracking-[0.18em] text-[#b9f5ff]">Your music, simply organized</p>
            <h1 className="mt-4 text-balance text-5xl font-semibold leading-[.98] tracking-[-.06em] text-white sm:text-6xl">Choose a few playlists that keep up with you.</h1>
            <p className="mx-auto mt-6 max-w-md text-pretty text-lg leading-8 text-[#cadbe3]">Connect Spotify once, then pick the small set of playlists you actually want to keep current.</p>
            <button className="mt-9 inline-flex items-center gap-2 rounded-full border border-[#0679b3] bg-[linear-gradient(color-mix(in_srgb,#31c3ee_26%,white)_0%,#31c3ee_46%,color-mix(in_srgb,#31c3ee_70%,#00527d)_100%)] px-5 py-3.5 text-sm font-semibold text-white shadow-[inset_0_1px_rgba(255,255,255,.9),0_2px_5px_rgba(0,0,0,.35)] transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[#8fefff] focus:ring-offset-2 focus:ring-offset-[#0b1720]" onClick={() => setIsConnectOpen(true)}>Connect Spotify <ChevronRight size={17} /></button>
            <p className="mt-5 text-sm text-[#abc2cd]">We only ask for the access needed to read your library and manage these playlists.</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center justify-between gap-4"><span className="rounded-full border border-[#a6ebfd]/60 bg-[linear-gradient(rgba(99,208,239,.27),rgba(14,126,172,.28))] px-3 py-1.5 text-xs font-semibold uppercase tracking-[.08em] text-[#d7f9ff] shadow-[inset_0_1px_rgba(255,255,255,.22)]">{screen === "setup" ? "Step 2 of 2" : "Your playlist selection"}</span><ProfileBadge profile={profile} compact /></div>
            <h1 className="mt-7 text-balance text-4xl font-semibold tracking-[-.055em] text-white sm:text-5xl">{screen === "setup" ? "Which playlists should stay current?" : "Your playlists"}</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-[#cadbe3]">{screen === "setup" ? "Start small. You can add or remove these any time." : "Recently Liked is ready to sync now. The rest are saved for later."}</p>
            <div className="mt-9 space-y-3">
              {(screen === "setup" ? playlists : selectedPlaylists).map((playlist) => <PlaylistOption key={playlist.id} playlist={playlist} selected={selectedIds.includes(playlist.id)} selectable={screen === "setup"} onClick={() => togglePlaylist(playlist.id)} />)}
            </div>
            {screen === "setup" ? <>
              {saveError && <p className="mt-4 text-sm text-[#f7a092]">{saveError}</p>}
              <button className="mt-7 flex w-full items-center justify-center gap-2 rounded-full border border-[#0679b3] bg-[linear-gradient(color-mix(in_srgb,#31c3ee_26%,white)_0%,#31c3ee_46%,color-mix(in_srgb,#31c3ee_70%,#00527d)_100%)] px-5 py-4 text-sm font-semibold text-white shadow-[inset_0_1px_rgba(255,255,255,.9),0_2px_5px_rgba(0,0,0,.35)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45" onClick={saveChoices} disabled={selectedIds.length === 0 || isSaving}>{isSaving ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={17} />}{isSaving ? "Saving your selection" : "Save my playlists"}</button>
              <p className="mt-4 text-center text-sm text-[#abc2cd]"><span className="mr-1">⌘</span>You can change this whenever you want.</p>
            </> : <>
              {selectedIds.includes("recently-added") && <RecentlyAddedSyncCard sync={recentlyAddedSync} isSyncing={isSyncing} error={syncError} onSync={syncRecentlyAdded} />}
              <button className="mt-5 flex items-center justify-center gap-2 rounded-full border border-[#9db1bd] bg-[linear-gradient(#fbfdff,#d7e2e9)] px-5 py-3.5 text-sm font-semibold text-[#213640] shadow-[inset_0_1px_white,0_1px_2px_rgba(0,0,0,.22)] transition hover:brightness-105" onClick={() => setScreen("setup")}>Edit my selection</button>
            </>}
          </div>
        )}
      </section>

      {isConnectOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#071117]/75 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="connect-title"><div className="w-full max-w-md rounded-xl border border-[#8197a5] bg-[linear-gradient(#fbfdff,#dbe5eb)] p-6 text-[#182934] shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><span className="grid h-12 w-12 place-items-center rounded-full border border-[#0a87b8] bg-[linear-gradient(#bdf7ff,#38c6ec_47%,#0984bf)] text-white shadow-[inset_0_1px_white]"><Disc3 size={23} /></span><button className="rounded-full border border-[#91a5b1] bg-[linear-gradient(#fff,#c7d3db)] p-2 text-[#526873] transition hover:brightness-105" onClick={() => setIsConnectOpen(false)} aria-label="Close connect dialog"><X size={19} /></button></div><p className="mt-7 text-xs font-medium uppercase tracking-[.17em] text-[#177db5]">First connection</p><h2 id="connect-title" className="mt-3 text-3xl font-semibold tracking-[-.055em]">Connect, then choose.</h2><p className="mt-4 text-sm leading-6 text-[#536873]">Spotify will ask for access to your saved songs, recent plays, and the private playlists this app manages.</p><a className="mt-6 flex w-full items-center justify-center gap-2 rounded-full border border-[#0679b3] bg-[linear-gradient(color-mix(in_srgb,#31c3ee_26%,white)_0%,#31c3ee_46%,color-mix(in_srgb,#31c3ee_70%,#00527d)_100%)] px-4 py-3.5 text-sm font-semibold text-white shadow-[inset_0_1px_white,0_2px_4px_rgba(0,0,0,.25)] transition hover:brightness-110" href="/api/spotify/connect">Continue to Spotify <ChevronRight size={17} /></a></div></div>}
    </main>
  );
}

function PlaylistOption({ playlist, selected, selectable, onClick }: { playlist: (typeof playlists)[number]; selected: boolean; selectable: boolean; onClick: () => void }) {
  const Icon = playlist.icon;
  return <button type="button" className={`flex w-full items-center gap-4 rounded-lg border p-4 text-left shadow-[inset_0_1px_white,0_3px_8px_rgba(0,0,0,.2)] transition focus:outline-none focus:ring-2 focus:ring-[#8fefff] disabled:cursor-default ${selected ? "border-[#29bce9] bg-[linear-gradient(#f8feff,#caeff9)]" : "border-[#95aab6] bg-[linear-gradient(#fbfdff,#d7e2e9)] hover:brightness-105"}`} onClick={selectable ? onClick : undefined} aria-pressed={selected} disabled={!selectable}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border border-[#678391] shadow-[inset_0_1px_rgba(255,255,255,.8)] ${selected ? "bg-[linear-gradient(135deg,#f9fdff,#9ee8f5_46%,#2086bd)] text-white" : "bg-[linear-gradient(135deg,#fff,#d0dae1_46%,#899aa6)] text-white"}`}><Icon size={19} /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-[#172a35]">{playlist.title}</span><span className="mt-1 block text-sm leading-5 text-[#536873]">{playlist.description}</span></span><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border shadow-[inset_0_1px_white] ${selected ? "border-[#0878b6] bg-[linear-gradient(#dcfcff,#4fc8eb_49%,#0784c1)] text-white" : "border-[#79919f] bg-[linear-gradient(#fff,#c8d6df)] text-transparent"}`}>{selected && <Check size={15} strokeWidth={3} />}</span></button>;
}

function ProfileBadge({ profile, compact = false }: { profile: SpotifyProfile; compact?: boolean }) {
  return <div className={`flex items-center gap-2 rounded-full border border-[#b6eaf9]/55 bg-[linear-gradient(rgba(237,252,255,.25),rgba(92,175,205,.16))] py-1.5 text-sm font-semibold text-[#edfbff] shadow-[inset_0_1px_rgba(255,255,255,.22)] ${compact ? "pl-1.5 pr-2.5" : "pl-2 pr-4"}`} role="status">{profile.imageUrl ? <img className="h-8 w-8 rounded-full border border-[#8fb0be] object-cover" src={profile.imageUrl} alt="" /> : <span className="grid h-8 w-8 place-items-center rounded-full border border-[#0a87b8] bg-[linear-gradient(#bdf7ff,#38c6ec_47%,#0984bf)] text-white"><Disc3 size={16} strokeWidth={2.5} /></span>}{!compact && <span className="max-w-32 truncate text-white">{profile.displayName ?? "Spotify"}</span>}<Check className="text-[#8ff2b5]" size={15} strokeWidth={2.75} aria-label="Spotify connected" /></div>;
}

function RecentlyAddedSyncCard({ sync, isSyncing, error, onSync }: { sync: RecentlyAddedSync | null; isSyncing: boolean; error: string | null; onSync: () => void }) {
  const syncLabel = sync?.lastSyncedAt
    ? `Last synced ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(sync.lastSyncedAt))}`
    : "Ready to create your private playlist";

  return <section className="mt-7 rounded-lg border border-[#95aab6] bg-[linear-gradient(#fbfdff,#d7e2e9)] p-5 text-[#182934] shadow-[inset_0_1px_white,0_3px_8px_rgba(0,0,0,.2)]">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#177db5]">Recently Liked is live</p><p className="mt-1 text-sm leading-6 text-[#536873]">{sync?.lastSyncedAt ? `${sync.trackCount} liked in the last 30 days · ${syncLabel}` : syncLabel}</p></div>{sync?.playlistUrl && <a className="shrink-0 text-sm font-semibold text-[#087eb8] hover:text-[#00527d]" href={sync.playlistUrl} target="_blank" rel="noreferrer">Open in Spotify</a>}</div>
    {error && <p className="mt-4 text-sm text-[#f7a092]">{error}</p>}
    <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-[#0679b3] bg-[linear-gradient(color-mix(in_srgb,#31c3ee_26%,white)_0%,#31c3ee_46%,color-mix(in_srgb,#31c3ee_70%,#00527d)_100%)] px-5 py-3.5 text-sm font-semibold text-white shadow-[inset_0_1px_white,0_2px_4px_rgba(0,0,0,.25)] transition hover:brightness-110 disabled:cursor-wait disabled:opacity-65" onClick={onSync} disabled={isSyncing}>{isSyncing ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}{isSyncing ? "Syncing Recently Liked" : sync ? "Sync Recently Liked" : "Create Recently Liked"}</button>
  </section>;
}
