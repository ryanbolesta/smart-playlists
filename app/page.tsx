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
    <main className="min-h-screen bg-[#0b0d0d] text-[#f5f7ee] selection:bg-[#d8ff79] selection:text-[#101410]">
      <div className="pointer-events-none fixed inset-0 opacity-70 [background:radial-gradient(circle_at_20%_0%,rgba(152,220,95,.11),transparent_32%),radial-gradient(circle_at_90%_18%,rgba(91,149,235,.09),transparent_30%)]" />
      <header className="relative mx-auto flex max-w-4xl items-center justify-between px-6 py-6 sm:py-8">
        <a className="flex items-center gap-3" href="#top" aria-label="Smart Playlists home"><span className="grid h-10 w-10 place-items-center rounded-[15px] bg-[#d8ff79] text-[#101410] shadow-[0_0_32px_rgba(216,255,121,.18)]"><Disc3 size={20} strokeWidth={2.25} /></span><span className="text-[15px] font-semibold tracking-[-0.03em]">Smart Playlists</span></a>
        {screen === "ready" && <ProfileBadge profile={profile} />}
      </header>

      <section id="top" className="relative mx-auto flex min-h-[calc(100vh-104px)] max-w-4xl items-center px-6 pb-16">
        {screen === "checking" ? (
          <div className="mx-auto flex items-center gap-3 text-sm text-white/55"><LoaderCircle size={18} className="animate-spin text-[#d8ff79]" /> Checking your Spotify connection</div>
        ) : screen === "disconnected" ? (
          <div className="mx-auto w-full max-w-xl text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-[21px] bg-[#d8ff79] text-[#101410]"><Disc3 size={27} /></span>
            <p className="mt-8 text-xs font-medium uppercase tracking-[0.18em] text-[#d8ff79]">Your music, simply organized</p>
            <h1 className="mt-4 text-balance text-5xl font-semibold leading-[.98] tracking-[-.06em] text-white sm:text-6xl">Choose a few playlists that keep up with you.</h1>
            <p className="mx-auto mt-6 max-w-md text-pretty text-lg leading-8 text-white/58">Connect Spotify once, then pick the small set of playlists you actually want to keep current.</p>
            <button className="mt-9 inline-flex items-center gap-2 rounded-full bg-[#d8ff79] px-5 py-3.5 text-sm font-semibold text-[#101410] transition hover:bg-[#e6ffab] focus:outline-none focus:ring-2 focus:ring-[#d8ff79] focus:ring-offset-2 focus:ring-offset-[#0b0d0d]" onClick={() => setIsConnectOpen(true)}>Connect Spotify <ChevronRight size={17} /></button>
            <p className="mt-5 text-sm text-white/36">We only ask for the access needed to read your library and manage these playlists.</p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-2xl">
            <div className="flex items-center justify-between gap-4"><span className="rounded-full border border-[#d8ff79]/25 bg-[#d8ff79]/10 px-3 py-1.5 text-xs font-semibold text-[#d8ff79]">{screen === "setup" ? "Step 2 of 2" : "Your playlist selection"}</span><ProfileBadge profile={profile} compact /></div>
            <h1 className="mt-7 text-balance text-4xl font-semibold tracking-[-.055em] text-white sm:text-5xl">{screen === "setup" ? "Which playlists should stay current?" : "Your playlists"}</h1>
            <p className="mt-4 max-w-xl text-lg leading-8 text-white/58">{screen === "setup" ? "Start small. You can add or remove these any time." : "Recently Liked is ready to sync now. The rest are saved for later."}</p>
            <div className="mt-9 space-y-3">
              {(screen === "setup" ? playlists : selectedPlaylists).map((playlist) => <PlaylistOption key={playlist.id} playlist={playlist} selected={selectedIds.includes(playlist.id)} selectable={screen === "setup"} onClick={() => togglePlaylist(playlist.id)} />)}
            </div>
            {screen === "setup" ? <>
              {saveError && <p className="mt-4 text-sm text-[#f7a092]">{saveError}</p>}
              <button className="mt-7 flex w-full items-center justify-center gap-2 rounded-full bg-[#d8ff79] px-5 py-4 text-sm font-semibold text-[#101410] transition hover:bg-[#e6ffab] disabled:cursor-not-allowed disabled:opacity-45" onClick={saveChoices} disabled={selectedIds.length === 0 || isSaving}>{isSaving ? <LoaderCircle size={17} className="animate-spin" /> : <Check size={17} />}{isSaving ? "Saving your selection" : "Save my playlists"}</button>
              <p className="mt-4 text-center text-sm text-white/38">You can change this whenever you want.</p>
            </> : <>
              {selectedIds.includes("recently-added") && <RecentlyAddedSyncCard sync={recentlyAddedSync} isSyncing={isSyncing} error={syncError} onSync={syncRecentlyAdded} />}
              <button className="mt-5 flex items-center justify-center gap-2 rounded-full border border-white/[.14] px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-white/[.08]" onClick={() => setScreen("setup")}>Edit my selection</button>
            </>}
          </div>
        )}
      </section>

      {isConnectOpen && <div className="fixed inset-0 z-50 grid place-items-center bg-[#060707]/75 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="connect-title"><div className="w-full max-w-md rounded-[28px] border border-white/[.13] bg-[#151918] p-6 shadow-2xl sm:p-7"><div className="flex items-start justify-between gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#d8ff79] text-[#101410]"><Disc3 size={23} /></span><button className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white" onClick={() => setIsConnectOpen(false)} aria-label="Close connect dialog"><X size={19} /></button></div><p className="mt-7 text-xs font-medium uppercase tracking-[.17em] text-[#d8ff79]">First connection</p><h2 id="connect-title" className="mt-3 text-3xl font-semibold tracking-[-.055em]">Connect, then choose.</h2><p className="mt-4 text-sm leading-6 text-white/58">Spotify will ask for access to your saved songs, recent plays, and the private playlists this app manages.</p><a className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#d8ff79] px-4 py-3.5 text-sm font-semibold text-[#101410] transition hover:bg-[#e6ffab]" href="/api/spotify/connect">Continue to Spotify <ChevronRight size={17} /></a></div></div>}
    </main>
  );
}

function PlaylistOption({ playlist, selected, selectable, onClick }: { playlist: (typeof playlists)[number]; selected: boolean; selectable: boolean; onClick: () => void }) {
  const Icon = playlist.icon;
  return <button type="button" className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-[#d8ff79] ${selected ? "border-[#d8ff79]/45 bg-[#d8ff79]/[.09]" : "border-white/[.11] bg-white/[.035] hover:border-white/25"}`} onClick={selectable ? onClick : undefined} aria-pressed={selected} disabled={!selectable}><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${selected ? "bg-[#d8ff79] text-[#101410]" : "bg-white/[.09] text-white/65"}`}><Icon size={19} /></span><span className="min-w-0 flex-1"><span className="block font-semibold text-white">{playlist.title}</span><span className="mt-1 block text-sm leading-5 text-white/50">{playlist.description}</span></span><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border ${selected ? "border-[#d8ff79] bg-[#d8ff79] text-[#101410]" : "border-white/20"}`}>{selected && <Check size={15} strokeWidth={3} />}</span></button>;
}

function ProfileBadge({ profile, compact = false }: { profile: SpotifyProfile; compact?: boolean }) {
  return <div className={`flex items-center gap-2 rounded-full border border-[#d8ff79]/25 bg-[#d8ff79]/10 py-1.5 text-sm font-semibold text-[#d8ff79] ${compact ? "pl-1.5 pr-2.5" : "pl-2 pr-4"}`} role="status">{profile.imageUrl ? <img className="h-8 w-8 rounded-full object-cover" src={profile.imageUrl} alt="" /> : <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d8ff79] text-[#101410]"><Disc3 size={16} strokeWidth={2.5} /></span>}{!compact && <span className="max-w-32 truncate text-white">{profile.displayName ?? "Spotify"}</span>}<Check size={15} strokeWidth={2.75} aria-label="Spotify connected" /></div>;
}

function RecentlyAddedSyncCard({ sync, isSyncing, error, onSync }: { sync: RecentlyAddedSync | null; isSyncing: boolean; error: string | null; onSync: () => void }) {
  const syncLabel = sync?.lastSyncedAt
    ? `Last synced ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(sync.lastSyncedAt))}`
    : "Ready to create your private playlist";

  return <section className="mt-7 rounded-2xl border border-[#d8ff79]/25 bg-[#d8ff79]/[.07] p-5">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm font-semibold text-[#d8ff79]">Recently Liked is live</p><p className="mt-1 text-sm leading-6 text-white/58">{sync?.lastSyncedAt ? `${sync.trackCount} liked in the last 30 days · ${syncLabel}` : syncLabel}</p></div>{sync?.playlistUrl && <a className="shrink-0 text-sm font-semibold text-[#d8ff79] hover:text-[#e6ffab]" href={sync.playlistUrl} target="_blank" rel="noreferrer">Open in Spotify</a>}</div>
    {error && <p className="mt-4 text-sm text-[#f7a092]">{error}</p>}
    <button className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#d8ff79] px-5 py-3.5 text-sm font-semibold text-[#101410] transition hover:bg-[#e6ffab] disabled:cursor-wait disabled:opacity-65" onClick={onSync} disabled={isSyncing}>{isSyncing ? <LoaderCircle size={17} className="animate-spin" /> : <RefreshCw size={17} />}{isSyncing ? "Syncing Recently Liked" : sync ? "Sync Recently Liked" : "Create Recently Liked"}</button>
  </section>;
}
