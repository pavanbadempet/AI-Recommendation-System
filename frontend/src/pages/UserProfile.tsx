import React, { useEffect, useState } from "react";
import {
  Database,
  Film,
  Loader2,
  Star,
  User,
  Activity,
  Network,
  Settings,
  BarChart3,
  Sparkles,
  Cpu,
  ShieldCheck,
  Zap,
  Layers,
  TrendingUp,
  MousePointerClick,
  Eye,
  Play,
  Bookmark
} from "lucide-react";
import { getUserRecommendations, apiGet } from "../api";
import type { Movie } from "../types";
import { safeGetLocalStorage, safeSetLocalStorage } from "../storage";

const imageBase = "https://image.tmdb.org/t/p/w500";

const FALLBACK_POSTER_SVG =
  "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 500 750' width='500' height='750'%3E%3Crect width='100%25' height='100%25' fill='%23121216'/%3E%3Ccircle cx='250' cy='340' r='54' fill='%231e222d' stroke='%23334155' stroke-width='4'/%3E%3Cpolygon points='240,320 270,340 240,360' fill='%2364748b'/%3E%3Ctext x='50%25' y='440' font-family='sans-serif' font-size='22' font-weight='700' fill='%2394a3b8' text-anchor='middle' letter-spacing='1.5'%3ENULLA CINEMA%3C/text%3E%3Ctext x='50%25' y='475' font-family='sans-serif' font-size='14' font-weight='500' fill='%23475569' text-anchor='middle'%3EPoster Preview%3C/text%3E%3C/svg%3E";

function handlePosterError(e: React.SyntheticEvent<HTMLImageElement>) {
  const el = e.currentTarget;
  if (!el.dataset.hasFallback) {
    el.dataset.hasFallback = "true";
    el.src = FALLBACK_POSTER_SVG;
  }
}

function posterUrl(path?: string | null): string {
  if (!path) return FALLBACK_POSTER_SVG;
  if (path.startsWith("http")) return path;
  return `${imageBase}${path}`;
}

// ─── Login Prompt ─────────────────────────────────────────────────────────────

function LoginPrompt({ onLogin }: { onLogin: () => void }) {
  return (
    <div className="profile-login-prompt" role="status">
      <div className="login-prompt-icon-wrapper">
        <User size={40} aria-hidden="true" />
      </div>
      <h3>Sign in to view your profile</h3>
      <p>Your personalized recommendations and watch history are available after signing in.</p>
      <button className="primary-action profile-signin-cta" type="button" onClick={onLogin}>
        Sign In
      </button>
    </div>
  );
}

// ─── Behavior Card ────────────────────────────────────────────────────────────

type BehaviorFeatures = {
  total_ratings?: number | null;
  avg_rating?: number | null;
  click_count?: number | null;
  view_count?: number | null;
  [key: string]: unknown;
};

function BehaviorCard({ features }: { features: BehaviorFeatures }) {
  function safeVal(v: number | null | undefined): string {
    if (v == null || !Number.isFinite(v) || v < 0) return "—";
    return v.toLocaleString();
  }

  const rows: { label: string; value: string; ariaLabel: string; icon: React.ReactNode; desc: string }[] = [
    {
      label: "Total Ratings",
      value: safeVal(features.total_ratings),
      ariaLabel: `Total ratings: ${safeVal(features.total_ratings)}`,
      icon: <Star size={16} aria-hidden="true" />,
      desc: "Films you've rated in your personal catalog",
    },
    {
      label: "Avg Rating",
      value:
        features.avg_rating != null && Number.isFinite(features.avg_rating) && features.avg_rating >= 0
          ? features.avg_rating.toFixed(1)
          : "—",
      ariaLabel: `Average rating: ${features.avg_rating?.toFixed(1) ?? "—"}`,
      icon: <TrendingUp size={16} aria-hidden="true" />,
      desc: "Average score across your rated titles",
    },
    {
      label: "Clicks",
      value: safeVal(features.click_count),
      ariaLabel: `Click count: ${safeVal(features.click_count)}`,
      icon: <MousePointerClick size={16} aria-hidden="true" />,
      desc: "Movies inspected and explored in detail",
    },
    {
      label: "Views",
      value: safeVal(features.view_count),
      ariaLabel: `View count: ${safeVal(features.view_count)}`,
      icon: <Eye size={16} aria-hidden="true" />,
      desc: "Catalog impressions across your viewing sessions",
    },
  ];

  return (
    <div className="dashboard-card sota-behavior-card" aria-label="Behavior statistics">
      <div className="dashboard-card-header">
        <h3 className="dashboard-card-title">
          <Star size={16} aria-hidden="true" />
          Behavior Statistics
        </h3>
        <span className="telemetry-live-chip">
          <span className="telemetry-live-dot" /> Profile Activity
        </span>
      </div>

      <p className="behavior-card-intro">
        Your viewing and rating activity helps tailor recommendations to your personal taste.
      </p>

      {/* Semantic definition list and micro-visual telemetry grid */}
      <dl className="hardware-dl behavior-metric-grid">
        {rows.map((row) => (
          <div className="hardware-row behavior-metric-tile" key={row.label}>
            <div className="metric-tile-top">
              <span className="metric-tile-icon">{row.icon}</span>
              <dt className="metric-tile-title">{row.label}</dt>
            </div>
            <dd className="metric-tile-value" aria-label={row.ariaLabel}>{row.value}</dd>
            <div className="metric-tile-desc">{row.desc}</div>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ─── Recommendation Card (mini) ───────────────────────────────────────────────

function MiniRecommendationCard({
  movie,
  onSelect,
}: {
  movie: Movie;
  onSelect: (movie: Movie) => void;
}) {
  const genreText = Array.isArray(movie.genres)
    ? movie.genres[0]
    : typeof movie.genres === "string"
      ? movie.genres.split(",")[0]?.trim()
      : "";

  return (
    <article className="recommendation-card sota-rec-card" aria-label={`Recommended: ${movie.title}`}>
      <div className="card-media">
        <button
          className="poster-card"
          type="button"
          onClick={() => onSelect(movie)}
          aria-label={`View details for ${movie.title}`}
        >
          <img
            src={posterUrl(movie.poster_path)}
            alt={`Poster for ${movie.title}`}
            loading="lazy"
            onError={handlePosterError}
          />
          <div className="poster-overlay-glow">
            <span className="poster-play-pill">
              <Play size={12} fill="currentColor" /> Preview
            </span>
          </div>
          {movie.vote_average ? (
            <span className="rec-match-badge">
              ★ {Number(movie.vote_average).toFixed(1)}
            </span>
          ) : null}
        </button>
      </div>
      <div className="recommendation-body">
        <div className="card-title-row">
          <strong title={movie.title}>{movie.title}</strong>
          <span>{movie.release_date?.slice(0, 4) ?? ""}</span>
        </div>
        {genreText && (
          <div className="genre-line">
            <span className="sota-genre-pill">{genreText}</span>
          </div>
        )}
      </div>
    </article>
  );
}

// ─── Watch History Section ────────────────────────────────────────────────────

const RECENT_STORAGE_KEY = "nova_recent_movies_v2";

function loadRecentMovies(): Movie[] {
  try {
    const raw = safeGetLocalStorage(RECENT_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]") as Movie[];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function WatchHistorySection({ onSelectMovie }: { onSelectMovie: (movie: Movie) => void }) {
  const recent = loadRecentMovies();
  if (recent.length === 0) {
    return (
      <p className="eval-meta" role="status">
        No watch history yet. Browse and click movies to build your history.
      </p>
    );
  }
  return (
    <>
      <p className="eval-meta">Stored in your browser — {recent.length} title{recent.length !== 1 ? "s" : ""} recently viewed.</p>
      <div className="poster-grid" aria-label="Recently viewed movies" style={{ marginTop: "12px" }}>
        {recent.map((movie) => (
          <MiniRecommendationCard key={movie.id} movie={movie} onSelect={onSelectMovie} />
        ))}
      </div>
    </>
  );
}

// ─── User Profile Page ────────────────────────────────────────────────────────

const WATCHLIST_STORAGE_KEY = "nova_watchlist_v2";

function loadWatchlistMovies(): Movie[] {
  try {
    const raw = safeGetLocalStorage(WATCHLIST_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]") as Movie[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function UserProfilePage({
  token,
  username,
  onRequestLogin,
  onSelectMovie,
  onNavigate,
}: {
  token: string | null;
  username: string | null;
  onRequestLogin: () => void;
  onSelectMovie: (movie: Movie) => void;
  onNavigate?: (page: string) => void;
}) {
  const [watchlist, setWatchlist] = useState<Movie[]>(() => loadWatchlistMovies());

  useEffect(() => {
    setWatchlist(loadWatchlistMovies());
  }, []);

  const handleRemoveFromWatchlist = (movieId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      const updated = watchlist.filter((m) => m.id !== movieId);
      safeSetLocalStorage(WATCHLIST_STORAGE_KEY, JSON.stringify(updated));
      setWatchlist(updated);
    } catch {
      // ignore
    }
  };

  const [features, setFeatures] = useState<BehaviorFeatures | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(false);
  const [featuresError, setFeaturesError] = useState<string | null>(null);

  const [recs, setRecs] = useState<Movie[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState<string | null>(null);

  useEffect(() => {
    if (!token || !username) return;

    setFeaturesLoading(true);
    setRecsLoading(true);

    apiGet<BehaviorFeatures>("/v1/events/features", {}, 15000)
      .then((res) => setFeatures(res.data))
      .catch((err) => setFeaturesError(err instanceof Error ? err.message : "Unavailable"))
      .finally(() => setFeaturesLoading(false));

    getUserRecommendations(username, 10)
      .then((res) => setRecs(res.data ?? []))
      .catch((err) => setRecsError(err instanceof Error ? err.message : "Unavailable"))
      .finally(() => setRecsLoading(false));
  }, [token, username]);

  if (!token) {
    return (
      <section className="profile-shell" aria-labelledby="profile-heading">
        <h2 id="profile-heading" className="visually-hidden">User Profile</h2>
        <LoginPrompt onLogin={onRequestLogin} />
      </section>
    );
  }

  const userInitials = username ? username.slice(0, 2).toUpperCase() : "US";

  return (
    <section className="profile-shell" aria-labelledby="profile-heading">
      {/* SOTA Enterprise Identity Hero Banner */}
      <div className="profile-hero-card">
        <div className="profile-hero-top">
          <div className="profile-avatar-wrapper">
            <div className="profile-avatar-circle" aria-hidden="true">
              {userInitials}
            </div>
            <span className="profile-online-dot" title="Lakehouse Session Active" />
          </div>

          <div className="profile-hero-details">
            <div className="profile-title-row">
              <h2 id="profile-heading" className="profile-user-headline">
                <User size={22} aria-hidden="true" />
                {username ? `Hi, ${username}` : "Your Profile"}
              </h2>
              <span className="lakehouse-tier-badge" style={{ background: "rgba(255, 255, 255, 0.08)", borderColor: "rgba(255, 255, 255, 0.16)", color: "#f8fafc" }}>
                <Sparkles size={14} aria-hidden="true" /> Cinema Pass Member
              </span>
            </div>
            <p className="dashboard-subtitle">
              Your personal film collection, saved queue, and personalized recommendations.
            </p>

            <div className="profile-meta-pills">
              <span className="profile-pill">
                <Bookmark size={13} aria-hidden="true" /> {watchlist.length} Saved in Queue
              </span>
              <span className="profile-pill">
                <Star size={13} aria-hidden="true" /> Member Since 2024
              </span>
              <span className="profile-pill">
                <Film size={13} aria-hidden="true" /> 4K Ultra HD & Spatial Audio
              </span>
            </div>
          </div>
        </div>

        {/* Personalized Taste Chips */}
        <div className="profile-taste-vector-strip">
          <span className="taste-strip-label">Favorite Genres:</span>
          <div className="taste-chips-list">
            <span className="taste-chip high"><span className="taste-dot green" /> Sci-Fi & Space</span>
            <span className="taste-chip high"><span className="taste-dot green" /> Psychological Thrillers</span>
            <span className="taste-chip med"><span className="taste-dot blue" /> Action & Adventure</span>
            <span className="taste-chip med"><span className="taste-dot blue" /> Crime & Mystery</span>
            <span className="taste-chip low"><span className="taste-dot purple" /> Dystopian & Mind-Benders</span>
          </div>
        </div>
      </div>

      {/* Saved Watchlist Section */}
      <div id="section-watchlist" className="dashboard-card sota-watchlist-container" aria-label="My Watchlist">
        <div className="dashboard-card-header">
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <Bookmark size={18} style={{ color: "#ffffff" }} aria-hidden="true" />
            <div>
              <h3 className="dashboard-card-title">
                My Watchlist
              </h3>
              <p className="dashboard-card-subtitle">
                {watchlist.length} {watchlist.length === 1 ? "movie" : "movies"} saved to your personal queue
              </p>
            </div>
          </div>
          <span className="telemetry-live-chip">
            {watchlist.length} Saved
          </span>
        </div>

        {watchlist.length === 0 ? (
          <div className="watchlist-empty-state" style={{ padding: "32px 16px", textAlign: "center", background: "rgba(255, 255, 255, 0.02)", borderRadius: "12px", border: "1px dashed rgba(255, 255, 255, 0.08)", marginTop: "12px" }}>
            <Bookmark size={28} style={{ color: "var(--muted)", opacity: 0.5, margin: "0 auto 8px auto", display: "block" }} />
            <strong style={{ color: "#f1f5f9", display: "block", marginBottom: "4px" }}>Your Watchlist is Empty</strong>
            <p style={{ color: "#94a3b8", fontSize: "0.84rem", margin: 0 }}>
              Click the <strong>Watchlist</strong> bookmark button on any movie card or popup to save titles directly here.
            </p>
          </div>
        ) : (
          <div className="poster-grid" aria-label="Saved watchlist movies" style={{ marginTop: "12px" }}>
            {watchlist.map((movie) => (
              <div key={`watchlist-${movie.id}`} style={{ position: "relative" }}>
                <MiniRecommendationCard
                  movie={movie}
                  onSelect={onSelectMovie}
                />
                <button
                  type="button"
                  onClick={(e) => handleRemoveFromWatchlist(movie.id, e)}
                  title="Remove from Watchlist"
                  aria-label={`Remove ${movie.title} from watchlist`}
                  style={{
                    position: "absolute",
                    top: "6px",
                    left: "6px",
                    background: "rgba(0, 0, 0, 0.75)",
                    border: "1px solid rgba(255, 255, 255, 0.2)",
                    borderRadius: "50%",
                    width: "24px",
                    height: "24px",
                    color: "#ffffff",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    zIndex: 10,
                    fontSize: "11px",
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Behavior stats */}
      {featuresLoading && (
        <div role="status" aria-live="polite" className="eval-loading">
          <Loader2 size={18} className="spin" aria-hidden="true" />
          <span>Loading behavior stats…</span>
        </div>
      )}
      {featuresError && <p className="dashboard-error" role="alert">{featuresError}</p>}
      {features && <BehaviorCard features={features} />}

      {/* Personalized recommendations */}
      <div className="dashboard-card sota-recs-container" aria-label="Personalized recommendations">
        <div className="dashboard-card-header">
          <div>
            <h3 className="dashboard-card-title">
              <Film size={16} aria-hidden="true" />
              Recommended for You
            </h3>
            <p className="dashboard-card-subtitle">
              Personalized film recommendations tailored to your viewing taste and ratings
            </p>
          </div>
        </div>

        {recsLoading && (
          <div role="status" aria-live="polite" className="eval-loading">
            <Loader2 size={18} className="spin" aria-hidden="true" />
            <span>Loading recommendations…</span>
          </div>
        )}
        {recsError && <p className="dashboard-error" role="alert">{recsError}</p>}
        {!recsLoading && !recsError && recs.length === 0 && (
          <p role="status">No personalized recommendations yet. Rate some movies to get started.</p>
        )}
        {recs.length > 0 && (
          <div className="poster-grid" aria-label="Personalized movie recommendations">
            {recs.map((movie) => (
              <MiniRecommendationCard
                key={movie.id}
                movie={movie}
                onSelect={onSelectMovie}
              />
            ))}
          </div>
        )}
      </div>

      {/* Watch history from localStorage */}
      <div className="dashboard-card sota-history-container" aria-label="Watch history">
        <div className="dashboard-card-header">
          <div>
            <h3 className="dashboard-card-title">
              <Database size={16} aria-hidden="true" />
              Local Watch History
            </h3>
            <p className="dashboard-card-subtitle">Titles you've recently explored and previewed</p>
          </div>
        </div>
        <WatchHistorySection onSelectMovie={onSelectMovie} />
      </div>

      {/* Developer and platform analytics options inside My Space */}
      {onNavigate && (
        <div className="profile-platform-link-bar" style={{ marginTop: "24px", padding: "16px 20px", background: "rgba(255, 255, 255, 0.02)", border: "1px solid rgba(255, 255, 255, 0.06)", borderRadius: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div>
            <span style={{ color: "#f8fafc", fontSize: "0.88rem", fontWeight: 600, display: "block" }}>
              Platform Engineering & Consoles
            </span>
            <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
              Explore data pipelines, neural galaxy vectors, and evaluation benchmarks
            </span>
          </div>
          <button
            type="button"
            onClick={() => onNavigate("data-platform")}
            style={{
              background: "transparent",
              border: "1px solid rgba(255, 255, 255, 0.16)",
              color: "#ffffff",
              padding: "7px 16px",
              borderRadius: "8px",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
              transition: "all 0.2s ease",
            }}
          >
            Open Data Platform →
          </button>
        </div>
      )}
    </section>
  );
}
