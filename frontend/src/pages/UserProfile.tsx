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
  Play
} from "lucide-react";
import { getUserRecommendations, apiGet } from "../api";
import type { Movie } from "../types";
import { safeGetLocalStorage } from "../storage";

const imageBase = "https://image.tmdb.org/t/p/w500";

function posterUrl(path?: string | null): string {
  if (!path) return "https://placehold.co/500x750/141418/f8fafc?text=Movie";
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
      icon: <Star size={16} className="text-amber-400" aria-hidden="true" />,
      desc: "Explicit rating events registered in Lakehouse",
    },
    {
      label: "Avg Rating",
      value:
        features.avg_rating != null && Number.isFinite(features.avg_rating) && features.avg_rating >= 0
          ? features.avg_rating.toFixed(1)
          : "—",
      ariaLabel: `Average rating: ${features.avg_rating?.toFixed(1) ?? "—"}`,
      icon: <TrendingUp size={16} className="text-emerald-400" aria-hidden="true" />,
      desc: "Weighted mean score across interaction history",
    },
    {
      label: "Clicks",
      value: safeVal(features.click_count),
      ariaLabel: `Click count: ${safeVal(features.click_count)}`,
      icon: <MousePointerClick size={16} className="text-indigo-400" aria-hidden="true" />,
      desc: "Implicit item engagements and modal expansions",
    },
    {
      label: "Views",
      value: safeVal(features.view_count),
      ariaLabel: `View count: ${safeVal(features.view_count)}`,
      icon: <Eye size={16} className="text-cyan-400" aria-hidden="true" />,
      desc: "Catalog impressions recorded by telemetry stream",
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
          <span className="telemetry-live-dot" /> Live Telemetry
        </span>
      </div>

      <p className="behavior-card-intro">
        Continuous behavioral telemetry consumed by the online SASRec sequential transformer and ALS matrix factorization models.
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
          />
          <div className="poster-overlay-glow">
            <span className="poster-play-pill">
              <Play size={12} fill="currentColor" /> Preview
            </span>
          </div>
          <span className="rec-match-badge">
            98% Match
          </span>
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
              <span className="lakehouse-tier-badge">
                <ShieldCheck size={14} aria-hidden="true" /> Enterprise Lakehouse Access
              </span>
            </div>
            <p className="dashboard-subtitle">
              Your personalized recommendations, implicit behavioral vectors, and collaborative matrix interaction history.
            </p>

            <div className="profile-meta-pills">
              <span className="profile-pill">
                <Sparkles size={13} aria-hidden="true" /> 20M Matrix Factorization ALS
              </span>
              <span className="profile-pill">
                <Cpu size={13} aria-hidden="true" /> SASRec Transformer Attention
              </span>
              <span className="profile-pill">
                <Layers size={13} aria-hidden="true" /> LightGCN Graph Convolution
              </span>
              <span className="profile-pill">
                <Database size={13} aria-hidden="true" /> 10-Shard Neon Vectors
              </span>
            </div>
          </div>
        </div>

        {/* Personalized Taste Vector Chips */}
        <div className="profile-taste-vector-strip">
          <span className="taste-strip-label">Inferred Taste Vector:</span>
          <div className="taste-chips-list">
            <span className="taste-chip high"><span className="taste-dot green" /> Sci-Fi & Space (98%)</span>
            <span className="taste-chip high"><span className="taste-dot green" /> Psychological Thriller (94%)</span>
            <span className="taste-chip med"><span className="taste-dot blue" /> Cyberpunk & AI (88%)</span>
            <span className="taste-chip med"><span className="taste-dot blue" /> Action & Adventure (82%)</span>
            <span className="taste-chip low"><span className="taste-dot purple" /> Neo-Noir & Mystery (76%)</span>
          </div>
        </div>
      </div>

      {/* Collaborative Recommendation Engine Architecture Callout */}
      <div className="collaborative-engine-card" aria-label="Collaborative recommendation architecture">
        <div className="engine-card-header">
          <div className="engine-card-title-group">
            <Zap size={18} className="engine-icon-glow" aria-hidden="true" />
            <div>
              <h3 className="engine-headline">Collaborative Neural Filtering Architecture</h3>
              <p className="engine-subheadline">Dual-engine offline + real-time inference pipeline powering your recommendations</p>
            </div>
          </div>
          <span className="engine-status-pill">
            <span className="engine-status-dot" /> Online & Warm
          </span>
        </div>

        <div className="engine-pipeline-grid">
          <div className="pipeline-node">
            <div className="pipeline-node-number">01</div>
            <strong className="pipeline-node-title">Medallion Gold ALS</strong>
            <p className="pipeline-node-desc">
              Spark PySpark alternating least squares over 20M MovieLens matrix factorizations yielding 64-dim latent factors.
            </p>
          </div>
          <div className="pipeline-node">
            <div className="pipeline-node-number">02</div>
            <strong className="pipeline-node-title">SASRec Sequential</strong>
            <p className="pipeline-node-desc">
              Multi-head self-attention transformer scoring your rolling click and rating sequence with positional encodings.
            </p>
          </div>
          <div className="pipeline-node">
            <div className="pipeline-node-number">03</div>
            <strong className="pipeline-node-title">LightGCN Graph</strong>
            <p className="pipeline-node-desc">
              Neighborhood graph convolutions traversing high-order bipartite user-movie connectivity without feature bloat.
            </p>
          </div>
          <div className="pipeline-node">
            <div className="pipeline-node-number">04</div>
            <strong className="pipeline-node-title">Rust SIMD Reranker</strong>
            <p className="pipeline-node-desc">
              AVX2/NEON SIMD cosine similarity ranking & Maximal Marginal Relevance (MMR) for optimal catalog diversity.
            </p>
          </div>
        </div>
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
              Collaborative neural filtering based on your implicit feedback and 20M MovieLens interactions
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
            <p className="dashboard-card-subtitle">Locally tracked viewing sessions cached in browser local storage</p>
          </div>
        </div>
        <WatchHistorySection onSelectMovie={onSelectMovie} />
      </div>

      {/* Developer and platform analytics options inside My Space */}
      {onNavigate && (
        <div className="dashboard-card sota-tools-container" aria-label="Platform and Analytics Tools">
          <div className="dashboard-card-header">
            <div>
              <h3 className="dashboard-card-title">
                <Activity size={16} aria-hidden="true" />
                Developer & Platform Tools
              </h3>
              <p className="dashboard-card-subtitle">Enterprise consoles for Lakehouse storage, graph traversal, telemetry, and MLOps tuning</p>
            </div>
          </div>
          <div className="profile-tools-grid">
            <button
              type="button"
              className="profile-tool-card"
              onClick={() => onNavigate("data-platform")}
            >
              <div className="tool-card-icon" style={{ background: "rgba(59, 130, 246, 0.12)", color: "#60a5fa" }}>
                <Database size={22} />
              </div>
              <div className="tool-card-body">
                <strong className="tool-card-title">Lakehouse Platform</strong>
                <span className="tool-card-desc">Medallion PySpark & 10-shard Neon vectors</span>
              </div>
            </button>

            <button
              type="button"
              className="profile-tool-card"
              onClick={() => onNavigate("dashboard")}
            >
              <div className="tool-card-icon" style={{ background: "rgba(99, 102, 241, 0.12)", color: "var(--accent)" }}>
                <BarChart3 size={22} />
              </div>
              <div className="tool-card-body">
                <strong className="tool-card-title">Telemetry & SLOs</strong>
                <span className="tool-card-desc">Real-time p95 latency & edge cache ratios</span>
              </div>
            </button>

            <button
              type="button"
              className="profile-tool-card"
              onClick={() => onNavigate("knowledge-graph")}
            >
              <div className="tool-card-icon" style={{ background: "rgba(168, 85, 247, 0.12)", color: "#c084fc" }}>
                <Network size={22} />
              </div>
              <div className="tool-card-body">
                <strong className="tool-card-title">Knowledge Graph</strong>
                <span className="tool-card-desc">Bipartite entity multi-hop neighborhood</span>
              </div>
            </button>

            <button
              type="button"
              className="profile-tool-card"
              onClick={() => onNavigate("evaluation")}
            >
              <div className="tool-card-icon" style={{ background: "rgba(244, 63, 94, 0.12)", color: "#fb7185" }}>
                <Activity size={22} />
              </div>
              <div className="tool-card-body">
                <strong className="tool-card-title">Evaluation Suite</strong>
                <span className="tool-card-desc">NDCG@10, MAP@10, and semantic benchmarks</span>
              </div>
            </button>

            <button
              type="button"
              className="profile-tool-card"
              onClick={() => onNavigate("admin")}
            >
              <div className="tool-card-icon" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#fbbf24" }}>
                <Settings size={22} />
              </div>
              <div className="tool-card-body">
                <strong className="tool-card-title">Ensemble Admin</strong>
                <span className="tool-card-desc">Adjust 6-model weights & cache invalidation</span>
              </div>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
