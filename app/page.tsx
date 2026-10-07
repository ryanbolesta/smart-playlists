"use client";

import {
  Check,
  Clock3,
  Compass,
  Disc3,
  History,
  LibraryBig,
  Play,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const playlists = [
  {
    id: "recently-added",
    number: "01",
    title: "Recently Added",
    eyebrow: "Your newest loves",
    description: "The latest songs you saved, kept in the order they found you.",
    cadence: "Updates whenever you add a song",
    detail: "50 latest liked songs · newest first",
    accent: "from-[#d8ff79] via-[#a4f349] to-[#54ca67]",
    icon: Plus,
  },
  {
    id: "lost-and-found",
    number: "02",
    title: "Lost & Found",
    eyebrow: "A little rediscovery",
    description: "A fresh pocket of songs you loved long enough ago to have forgotten.",
    cadence: "Refreshes every Sunday",
    detail: "50 liked songs · added 6+ months ago",
    accent: "from-[#fbc783] via-[#f1846d] to-[#cb5573]",
    icon: Compass,
  },
  {
    id: "time-capsule",
    number: "03",
    title: "Time Capsule",
    eyebrow: "Same season, other year",
    description: "Open a window into the songs that became part of your life around this time.",
    cadence: "Revisits your library daily",
    detail: "Songs liked 1, 2, or 5 years ago",
    accent: "from-[#a7b8ff] via-[#8e75ea] to-[#694fa8]",
    icon: Clock3,
  },
  {
    id: "recently-played",
    number: "04",
    title: "Recently Played",
    eyebrow: "Keep the thread",
    description: "The last songs you played, de-duplicated and ready when a title slips away.",
    cadence: "Stays current as you listen",
    detail: "50 distinct tracks · newest play first",
    accent: "from-[#85e8ef] via-[#48a5d0] to-[#466bd2]",
    icon: History,
  },
] as const;

export default function Home() {
  const [activeId, setActiveId] = useState<(typeof playlists)[number]["id"]>(
    "recently-added",
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [enabled, setEnabled] = useState<string[]>(["recently-added"]);
  const [spotifyConnection, setSpotifyConnection] = useState<
    "checking" | "connected" | "disconnected"
  >("checking");
  const [spotifyProfile, setSpotifyProfile] = useState<{
    displayName: string | null;
    imageUrl: string | null;
  }>({ displayName: null, imageUrl: null });

  useEffect(() => {
    let active = true;

    fetch("/api/spotify/status")
      .then((response) => response.json())
      .then((data: { connected?: boolean; displayName?: string | null; imageUrl?: string | null }) => {
        if (active) {
          setSpotifyConnection(data.connected ? "connected" : "disconnected");
          setSpotifyProfile({
            displayName: data.displayName ?? null,
            imageUrl: data.imageUrl ?? null,
          });
        }
      })
      .catch(() => {
        if (active) setSpotifyConnection("disconnected");
      });

    return () => {
      active = false;
    };
  }, []);

  const activePlaylist = playlists.find((playlist) => playlist.id === activeId)!;
  const ActiveIcon = activePlaylist.icon;
  const isEnabled = enabled.includes(activeId);

  function togglePlaylist(id: string) {
    setEnabled((current) =>
      current.includes(id)
        ? current.filter((playlistId) => playlistId !== id)
        : [...current, id],
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#0b0d0d] text-[#f5f7ee] selection:bg-[#d8ff79] selection:text-[#101410]">
      <div className="pointer-events-none fixed inset-0 opacity-70 [background:radial-gradient(circle_at_18%_0%,rgba(152,220,95,.12),transparent_30%),radial-gradient(circle_at_92%_32%,rgba(91,149,235,.11),transparent_28%)]" />

      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
        <a className="flex items-center gap-3" href="#top" aria-label="Smart Playlists home">
          <span className="grid h-10 w-10 place-items-center rounded-[15px] bg-[#d8ff79] text-[#101410] shadow-[0_0_32px_rgba(216,255,121,.18)]">
            <Disc3 size={20} strokeWidth={2.25} />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.03em]">Smart Playlists</span>
        </a>

        <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-2 text-xs text-white/55 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#d8ff79]" />
          Spotify-first, by design
        </div>

        {spotifyConnection === "connected" ? (
          <div className="flex items-center gap-2 rounded-full border border-[#d8ff79]/25 bg-[#d8ff79]/10 py-1.5 pl-2 pr-4 text-sm font-semibold text-[#d8ff79]" role="status">
            {spotifyProfile.imageUrl ? (
              <img
                className="h-8 w-8 rounded-full object-cover"
                src={spotifyProfile.imageUrl}
                alt=""
              />
            ) : (
              <span className="grid h-8 w-8 place-items-center rounded-full bg-[#d8ff79] text-[#101410]">
                <Disc3 size={16} strokeWidth={2.5} />
              </span>
            )}
            <span className="max-w-32 truncate text-white">
              {spotifyProfile.displayName ?? "Spotify"}
            </span>
            <Check size={15} strokeWidth={2.75} aria-label="Connected" />
          </div>
        ) : (
          <button
            className="rounded-full bg-[#d8ff79] px-4 py-2.5 text-sm font-semibold text-[#101410] transition hover:bg-[#e6ffab] focus:outline-none focus:ring-2 focus:ring-[#d8ff79] focus:ring-offset-2 focus:ring-offset-[#0b0d0d] disabled:cursor-wait disabled:opacity-70"
            onClick={() => setIsModalOpen(true)}
            disabled={spotifyConnection === "checking"}
          >
            {spotifyConnection === "checking" ? "Checking Spotify…" : "Connect Spotify"}
          </button>
        )}
      </header>

      <section id="top" className="relative z-10 mx-auto max-w-7xl px-6 pb-12 pt-12 lg:px-10 lg:pb-16 lg:pt-20">
        <div className="max-w-3xl">
          <p className="mb-5 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.18em] text-[#d8ff79]">
            <Sparkles size={14} /> Your library, in motion
          </p>
          <h1 className="max-w-3xl text-balance text-5xl font-semibold leading-[0.96] tracking-[-0.065em] text-white sm:text-6xl lg:text-7xl">
            Four small rituals for the music you already love.
          </h1>
          <p className="mt-7 max-w-xl text-pretty text-lg leading-8 text-white/58">
            Smart Playlists turns the history inside your Spotify library into simple playlists that stay useful on their own.
          </p>
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(300px,.55fr)]">
          <div className="grid gap-3 sm:grid-cols-2">
            {playlists.map((playlist) => {
              const PlaylistIcon = playlist.icon;
              const selected = playlist.id === activeId;
              const playlistIsEnabled = enabled.includes(playlist.id);

              return (
                <button
                  key={playlist.id}
                  className={`group relative min-h-[246px] overflow-hidden rounded-[26px] border p-6 text-left transition duration-300 focus:outline-none focus:ring-2 focus:ring-[#d8ff79] ${
                    selected
                      ? "border-white/25 bg-white/[0.105] shadow-[0_24px_50px_rgba(0,0,0,.16)]"
                      : "border-white/[0.09] bg-white/[0.035] hover:border-white/20 hover:bg-white/[0.065]"
                  }`}
                  onClick={() => setActiveId(playlist.id)}
                >
                  <div className={`absolute -right-16 -top-16 h-40 w-40 rounded-full bg-gradient-to-br ${playlist.accent} opacity-[0.19] blur-2xl transition duration-500 group-hover:opacity-30`} />
                  <div className="relative flex items-start justify-between">
                    <span className="text-xs font-medium tracking-[0.14em] text-white/40">{playlist.number}</span>
                    <span className={`grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br ${playlist.accent} text-[#101410] shadow-lg`}>
                      <PlaylistIcon size={19} strokeWidth={2.2} />
                    </span>
                  </div>
                  <div className="relative mt-10">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-[-0.04em] text-white">{playlist.title}</h2>
                      {playlistIsEnabled && <Check size={15} className="text-[#d8ff79]" aria-label="Enabled" />}
                    </div>
                    <p className="mt-1 text-sm text-[#d8ff79]">{playlist.eyebrow}</p>
                    <p className="mt-4 max-w-[30ch] text-sm leading-6 text-white/55">{playlist.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          <aside className="relative overflow-hidden rounded-[28px] border border-white/[0.11] bg-[#141817] p-6 sm:p-7">
            <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${activePlaylist.accent}`} />
            <p className="text-xs font-medium uppercase tracking-[0.17em] text-white/40">In focus</p>
            <div className="mt-7 flex items-center gap-4">
              <span className={`grid h-14 w-14 place-items-center rounded-[21px] bg-gradient-to-br ${activePlaylist.accent} text-[#101410]`}>
                <ActiveIcon size={26} />
              </span>
              <div>
                <h2 className="text-2xl font-semibold tracking-[-0.05em]">{activePlaylist.title}</h2>
                <p className="mt-1 text-sm text-white/46">{activePlaylist.eyebrow}</p>
              </div>
            </div>

            <p className="mt-8 text-base leading-7 text-white/70">{activePlaylist.description}</p>
            <div className="mt-8 space-y-3 border-y border-white/[0.09] py-5 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/45">Shape</span>
                <span className="text-right font-medium text-white/82">{activePlaylist.detail}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-white/45">Rhythm</span>
                <span className="text-right font-medium text-white/82">{activePlaylist.cadence}</span>
              </div>
            </div>

            <button
              className={`mt-7 flex w-full items-center justify-center gap-2 rounded-full px-4 py-3.5 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#d8ff79] focus:ring-offset-2 focus:ring-offset-[#141817] ${
                isEnabled
                  ? "bg-white/[0.1] text-white hover:bg-white/[0.16]"
                  : "bg-[#d8ff79] text-[#101410] hover:bg-[#e6ffab]"
              }`}
              onClick={() => togglePlaylist(activeId)}
            >
              {isEnabled ? <Check size={17} /> : <Plus size={17} />}
              {isEnabled ? "Included in your launch" : "Add to your launch"}
            </button>
          </aside>
        </div>
      </section>

      <section className="relative z-10 border-y border-white/[0.07] bg-white/[0.025]">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[.75fr_1.25fr] lg:px-10">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.17em] text-[#d8ff79]">The promise</p>
            <h2 className="mt-4 max-w-sm text-3xl font-semibold leading-tight tracking-[-0.05em]">No rules to learn. No settings to babysit.</h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Connect once", "Give Spotify permission to read your library and manage only these playlists."],
              ["Choose your rituals", "Start with the playlists that feel useful. Each one has a clear, fixed job."],
              ["Let them stay current", "A quiet background sync keeps your selected playlists ready in Spotify."],
            ].map(([title, description], index) => (
              <div key={title} className="border-l border-white/[0.12] pl-4">
                <p className="text-xs text-white/35">0{index + 1}</p>
                <h3 className="mt-3 font-medium text-white/90">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-white/48">{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="relative z-10 mx-auto flex max-w-7xl flex-col gap-4 px-6 py-7 text-sm text-white/38 sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <span className="flex items-center gap-2"><LibraryBig size={15} /> Built around the music you have already chosen.</span>
        <span>Personal beta · Spotify-first</span>
      </footer>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#060707]/75 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="connect-title">
          <div className="w-full max-w-md rounded-[28px] border border-white/[0.13] bg-[#151918] p-6 shadow-2xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#d8ff79] text-[#101410]"><Disc3 size={23} /></span>
              <button className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white" onClick={() => setIsModalOpen(false)} aria-label="Close connect dialog"><X size={19} /></button>
            </div>
            <p className="mt-7 text-xs font-medium uppercase tracking-[0.17em] text-[#d8ff79]">First connection</p>
            <h2 id="connect-title" className="mt-3 text-3xl font-semibold tracking-[-0.055em]">Your Spotify account stays yours.</h2>
            <p className="mt-4 text-sm leading-6 text-white/58">The real connection will ask only to read your saved songs and recent plays, then create the private playlists you select. No playback control. No opaque recommendations.</p>
            <div className="mt-6 rounded-2xl border border-white/[0.09] bg-black/15 p-4 text-sm text-white/65">
              <div className="flex items-center gap-3"><Play size={16} className="text-[#d8ff79]" fill="currentColor" /> We only request access to your saved songs, recent plays, and private Smart Playlists.</div>
            </div>
            <a
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#d8ff79] px-4 py-3.5 text-sm font-semibold text-[#101410] transition hover:bg-[#e6ffab]"
              href="/api/spotify/connect"
            >
              Continue to Spotify <Play size={17} fill="currentColor" />
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
