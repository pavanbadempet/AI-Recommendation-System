import React from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bookmark,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Film,
  Gauge,
  Info,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Share2,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  WandSparkles,
  X,
  User,
  LogOut,
  Network,
  Volume2,
} from "lucide-react";
import {
  apiGet,
  artifactHealth,
  aiSearch,
  backendLabel,
  currentBackend,
  getMovie,
  getMovieEnriched,
  getRecommendations,
  getUserRecommendations,
  loadTitles,
  pingApi,
  platformReadiness,
  platformStatus,
  recordEvent,
  searchMovies,
  getShowcaseMovies,
  semanticBenchmark,
  checkVideoCacheStatus,
} from "./api";
import type {
  ArtifactHealth,
  EventPayload,
  Movie,
  MovieTitle,
  PlatformReadiness,
  PlatformStatus,
  SemanticBenchmark,
} from "./types";
import "./styles.css";
import "./apex-product.css";
import "./profile-sota.css";
import { AuthPage } from "./AuthPage";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  safeGetLocalStorage,
  safeSetLocalStorage,
  safeRemoveLocalStorage,
  safeGetSessionStorage,
  safeSetSessionStorage,
} from "./storage";
const Dashboard = React.lazy(() => import("./pages/Dashboard").then(m => ({ default: m.Dashboard })));
const KnowledgeGraphPage = React.lazy(() => import("./pages/KnowledgeGraph").then(m => ({ default: m.KnowledgeGraphPage })));
const EvaluationPage = React.lazy(() => import("./pages/Evaluation").then(m => ({ default: m.EvaluationPage })));
const UserProfilePage = React.lazy(() => import("./pages/UserProfile").then(m => ({ default: m.UserProfilePage })));
const AdminPanel = React.lazy(() => import("./pages/AdminPanel").then(m => ({ default: m.AdminPanel })));
const LandingPage = React.lazy(() => import("./pages/Landing").then(m => ({ default: m.LandingPage })));
const SignupPage = React.lazy(() => import("./pages/Signup").then(m => ({ default: m.SignupPage })));
const PricingPage = React.lazy(() => import("./pages/Pricing").then(m => ({ default: m.PricingPage })));
const GettingStartedPage = React.lazy(() => import("./pages/GettingStarted").then(m => ({ default: m.GettingStartedPage })));
const StatusPage = React.lazy(() => import("./pages/Status").then(m => ({ default: m.StatusPage })));
const VectorSpace = React.lazy(() => import("./VectorSpace").then(m => ({ default: m.VectorSpace })));
const DataEngineeringPage = React.lazy(() => import("./pages/DataEngineering").then(m => ({ default: m.DataEngineeringPage })));

function SuspenseFallback() {
  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "200px", width: "100%", height: "100%" }}>
      <Loader2 className="spin" size={28} style={{ color: "var(--accent)" }} />
    </div>
  );
}


const imageBase = import.meta.env.VITE_TMDB_IMAGE_BASE || "https://image.tmdb.org/t/p/w500";
const RECENT_STORAGE_KEY = "nova_recent_movies_v2";
const SESSION_STORAGE_KEY = "nova_session_id_v1";
const SHOWCASE_STORAGE_KEY = "nova_cached_showcase_movies_v1";
const LATEST_STORAGE_KEY = "nova_cached_latest_movies_v1";
const TITLE_CATALOG_LIMIT = 5000;

export const KNOWN_TRAILERS: Record<number, string> = {
  329: "lc0UehYemQA", // Jurassic Park
  27205: "YoHD9XEInc0", // Inception
  157336: "zSWdZVtXT7E", // Interstellar
  155: "EXeTwQWrcwY", // The Dark Knight
  550: "qtRKdVHc-cE", // Fight Club
  680: "s7EdQ4FqbhY", // Pulp Fiction
  603: "vKQi3bBA1y8", // The Matrix
  238: "sY1S34973zA", // The Godfather
  120: "V75dMMW-qqc", // LOTR Fellowship
  122: "r5X-hFf6Bwo", // LOTR Return of the King
  129: "ByXuk9QqQkk", // Spirited Away
  98: "owK1qxDselE", // Gladiator
  19995: "5PSNL1qE6VY", // Avatar
  597: "2e-eXJ6HgkQ", // Titanic
  693134: "Way9Dexny3w", // Dune 2
  872585: "uYPbbksJxIg", // Oppenheimer
  496243: "5xH0RZE7t4E", // Parasite
  244786: "7d_jQycdQGo", // Whiplash
  324857: "tg52up16eq0", // Spider-Man Spider-Verse
  335984: "gCcx85zbxz4", // Blade Runner 2049
  278: "PLl99DlL6b4", // Shawshank Redemption
  769: "2ilzidi_J8Q", // GoodFellas
  807: "znmZoVkCjpI", // Seven
  13: "bLvqoHBptjg", // Forrest Gump
  105: "qvsgGtivCgs", // Back to the Future
  354912: "Rvr68u6k5sI", // Coco
  348: "LjLamj-b0I8", // Alien
  274: "W6Mm8Sbe__o", // Silence of the Lambs
  299534: "TcMBFSGVi1c", // Avengers Endgame
  346698: "pBk4NYhWNMM", // Barbie
};

type AppPage = "home" | "search" | "vector-space" | "data-platform" | "profile" | "dashboard" | "knowledge-graph" | "evaluation" | "admin" | "landing" | "signup" | "pricing" | "getting-started" | "status";
type SearchMode = "title" | "semantic";
type CatalogState = "booting" | "warming" | "ready" | "error";
type ResultsKind = "idle" | "search" | "recommendations";
type SelectionSource = "title_search" | "semantic_search" | "search_result" | "recommendation_card" | "recent_pick";
type FeedbackValue = "positive" | "negative";

export function getPageFromPath(pathname: string): AppPage {
  const clean = pathname.toLowerCase().replace(/\/+$/, "") || "/";
  if (clean === "/search") return "search";
  if (clean === "/discover") return "search";
  if (clean === "/3d-galaxy" || clean === "/vector-space" || clean === "/galaxy") return "vector-space";
  if (clean === "/data-platform" || clean === "/platform" || clean === "/pipeline") return "data-platform";
  if (clean === "/watchlist" || clean === "/profile") return "profile";
  if (clean === "/dashboard") return "dashboard";
  if (clean === "/knowledge-graph" || clean === "/graph") return "knowledge-graph";
  if (clean === "/evaluation" || clean === "/eval") return "evaluation";
  if (clean === "/admin") return "admin";
  if (clean === "/landing") return "landing";
  if (clean === "/signup") return "signup";
  if (clean === "/pricing") return "pricing";
  if (clean === "/getting-started") return "getting-started";
  if (clean === "/status") return "status";
  return "home";
}

export function pageToPath(targetPage: AppPage, searchMode?: SearchMode): string {
  switch (targetPage) {
    case "home": return "/";
    case "search": return searchMode === "semantic" ? "/discover" : "/search";
    case "vector-space": return "/3d-galaxy";
    case "data-platform": return "/data-platform";
    case "profile": return "/watchlist";
    case "dashboard": return "/dashboard";
    case "knowledge-graph": return "/knowledge-graph";
    case "evaluation": return "/evaluation";
    case "admin": return "/admin";
    case "landing": return "/landing";
    case "signup": return "/signup";
    case "pricing": return "/pricing";
    case "getting-started": return "/getting-started";
    case "status": return "/status";
    default: return "/";
  }
}


function posterUrl(path?: string | null): string {
  if (!path) return "https://placehold.co/500x750/141418/f8fafc?text=Movie";
  if (path.startsWith("http")) return path;
  return `${imageBase}${path}`;
}

function backdropUrl(path?: string | null): string {
  if (!path) return posterUrl(path);
  if (path.startsWith("http")) return path;
  return `https://image.tmdb.org/t/p/original${path}`;
}

function movieYear(movie: Movie): string {
  return movie.release_date?.slice(0, 4) || "TBA";
}

function movieScore(movie: Movie): string {
  const value = Number(movie.vote_average || 0);
  return value > 0 ? value.toFixed(1) : "NR";
}

function formatCount(value?: number | null): string {
  const numeric = Number(value || 0);
  return numeric > 0 ? numeric.toLocaleString() : "0";
}

function compactGenres(genres?: string | string[] | null): string {
  if (!genres) return "Catalog";
  if (Array.isArray(genres)) {
    const valid = genres.map((g) => String(g).trim()).filter(Boolean);
    return valid.length > 0 ? valid.slice(0, 2).join(" / ") : "Catalog";
  }
  if (typeof genres !== "string") return "Catalog";
  return genres
    .split(/[,|]/)
    .map((genre) => genre.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" / ") || "Catalog";
}

function selectTitleLabel(movie: Movie): string {
  const year = movieYear(movie);
  const titleHasYear = /\(\d{4}\)/.test(movie.title);
  const title = titleHasYear || year === "TBA" ? movie.title : `${movie.title} (${year})`;
  const genres = compactGenres(movie.genres).replaceAll(" / ", ", ");
  return genres === "Catalog" ? title : `${title} - ${genres}`;
}

function formatMatchPercentage(rawScore?: number | null): number {
  if (rawScore === undefined || rawScore === null || !Number.isFinite(Number(rawScore))) {
    return 95;
  }
  const val = Number(rawScore);
  if (val <= 0) return 75;
  if (val <= 1.0) {
    return Math.max(65, Math.min(99, Math.round(val * 100)));
  }
  // Multi-hop graph / hybrid candidate score (e.g. 1.0 - 5.0)
  const normalized = Math.min(0.99, 0.72 + Math.tanh(val / 3.0) * 0.26);
  return Math.max(65, Math.min(99, Math.round(normalized * 100)));
}


function confidence(movie: Movie): string {
  const score = formatMatchPercentage(movie.similarity_score);
  return `${score}% match`;
}

function matchLabel(stage?: string | null): string {
  const normalized = (stage || "").toLowerCase();
  if (normalized.includes("llm") || normalized.includes("rerank")) return "AI rerank";
  if (normalized.includes("hybrid")) return "Hybrid rank";
  if (normalized.includes("dense") || normalized.includes("vector") || normalized.includes("faiss")) {
    return "Vector recall";
  }
  if (normalized.includes("sparse") || normalized.includes("tfidf") || normalized.includes("lexical")) {
    return "Lexical recall";
  }
  return "Content match";
}

function cleanStage(stage?: string | null): string {
  return matchLabel(stage).replace(" rank", "").replace(" recall", "");
}

function movieReasons(movie: Movie): string[] {
  if (movie.explanation?.length) return movie.explanation.slice(0, 2);
  if (movie.explanation_text) {
    return movie.explanation_text
      .split(/(?<=[.!?])\s+/)
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 2);
  }
  const genres = compactGenres(movie.genres);
  return genres === "Catalog" ? [] : [`Shares ${genres.toLowerCase()} signals.`];
}

function semanticDetails(movie: Movie): Record<string, unknown> | null {
  const signals = movie.retrieval_signals || movie.semantic_signals;
  const details = signals?.semantic_twin_details;
  return details && typeof details === "object" ? (details as Record<string, unknown>) : null;
}

function semanticPercent(movie: Movie): string | null {
  const details = semanticDetails(movie);
  const raw = Number(details?.score ?? movie.retrieval_signals?.semantic_twin);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  return `${Math.max(1, Math.min(99, Math.round(raw * 100)))}% semantic`;
}

function evidenceChips(movie: Movie): string[] {
  const details = semanticDetails(movie);
  if (!details) return [];
  const concepts = Array.isArray(details.shared_concepts) ? details.shared_concepts : [];
  const arcs = Array.isArray(details.shared_emotional_arcs) ? details.shared_emotional_arcs : [];
  const jobs = Array.isArray(details.shared_viewer_jobs) ? details.shared_viewer_jobs : [];
  return [...concepts, ...arcs, ...jobs]
    .map((item) => String(item).replaceAll("_", " "))
    .filter(Boolean)
    .slice(0, 4);
}

function directorLabel(movie: Movie): string {
  if (movie.director) return movie.director;
  const reason = movie.explanation?.find((item) => item.toLowerCase().startsWith("same director"));
  const match = reason?.match(/\(([^)]+)\)/);
  return match?.[1] || "";
}

function dedupeMovies(items: Movie[]): Movie[] {
  const seen = new Set<string>();
  return items.filter((movie) => {
    const key = movie.id ? `id:${movie.id}` : `title:${movie.title.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function serviceLabel(url: string): string {
  if (typeof window !== "undefined" && url.replace(/\/+$/, "") === window.location.origin.replace(/\/+$/, "")) {
    return "Same-origin API";
  }
  if (url.includes("hf.space")) return "HF Space API";
  if (url.includes("onrender.com")) return "Render API";
  return backendLabel(url);
}

function loadRecentMovies(): Movie[] {
  try {
    const raw = safeGetLocalStorage(RECENT_STORAGE_KEY);
    const parsed = JSON.parse(raw || "[]") as Movie[];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function saveRecentMovies(movies: Movie[]) {
  try {
    safeSetLocalStorage(RECENT_STORAGE_KEY, JSON.stringify(movies.slice(0, 6)));
  } catch {
    // Local storage is optional; the app still works without it.
  }
}

const SEED_SHOWCASE_MOVIES: Movie[] = [
  {
    id: 693134,
    title: "Dune: Part Two",
    overview: "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.",
    genres: "Science Fiction, Adventure",
    vote_average: 8.3,
    vote_count: 14200,
    popularity: 180.0,
    release_date: "2024-02-27",
    poster_path: "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg",
    trailer_key: "Way9Dexny3w",
    director: "Denis Villeneuve",
    runtime: 166,
  },
  {
    id: 157336,
    title: "Interstellar",
    overview: "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel and conquer the vast distances involved in an interstellar voyage.",
    genres: "Adventure, Drama, Science Fiction",
    vote_average: 8.4,
    vote_count: 32100,
    popularity: 142.1,
    release_date: "2014-11-05",
    poster_path: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
    trailer_key: "zSWdZVtXT7E",
    director: "Christopher Nolan",
    runtime: 169,
  },
  {
    id: 27205,
    title: "Inception",
    overview: "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea.",
    genres: "Action, Science Fiction, Adventure",
    vote_average: 8.4,
    vote_count: 34500,
    popularity: 125.4,
    release_date: "2010-07-15",
    poster_path: "/8IB2e4r4oVhHn97LIXAWawzuv00.jpg",
    trailer_key: "YoHD9XEInc0",
    director: "Christopher Nolan",
    runtime: 148,
  },
  {
    id: 155,
    title: "The Dark Knight",
    overview: "Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and District Attorney Harvey Dent against the Joker.",
    genres: "Drama, Action, Crime, Thriller",
    vote_average: 8.5,
    vote_count: 30500,
    popularity: 118.6,
    release_date: "2008-07-16",
    poster_path: "/qJ2tW6WMUDux911r6m7haRef0WH.jpg",
    trailer_key: "EXeTwQWrcwY",
    director: "Christopher Nolan",
    runtime: 152,
  },
  {
    id: 872585,
    title: "Oppenheimer",
    overview: "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.",
    genres: "Drama, History",
    vote_average: 8.1,
    vote_count: 12500,
    popularity: 160.0,
    release_date: "2023-07-19",
    poster_path: "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg",
    trailer_key: "uYPbbksJxIg",
    director: "Christopher Nolan",
    runtime: 180,
  },
  {
    id: 238,
    title: "The Godfather",
    overview: "Spanning the years 1945 to 1955, a chronicle of the fictional Italian-American Corleone crime family.",
    genres: "Drama, Crime",
    vote_average: 8.7,
    vote_count: 18900,
    popularity: 115.0,
    release_date: "1972-03-14",
    poster_path: "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg",
    trailer_key: "sY1S34973zA",
    director: "Francis Ford Coppola",
    runtime: 175,
  },
  {
    id: 680,
    title: "Pulp Fiction",
    overview: "A burger-loving hit man, his philosophical partner, a drug-addled gangster's moll and a washed-up boxer converge in four tales of violence.",
    genres: "Thriller, Crime",
    vote_average: 8.5,
    vote_count: 26000,
    popularity: 105.1,
    release_date: "1994-09-10",
    poster_path: "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg",
    trailer_key: "s7EdQ4FqbhY",
    director: "Quentin Tarantino",
    runtime: 154,
  },
  {
    id: 603,
    title: "The Matrix",
    overview: "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the machines.",
    genres: "Action, Science Fiction",
    vote_average: 8.2,
    vote_count: 24000,
    popularity: 95.0,
    release_date: "1999-03-30",
    poster_path: "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg",
    trailer_key: "vKQi3bBA1y8",
    director: "Lana Wachowski, Lilly Wachowski",
    runtime: 136,
  },
  {
    id: 496243,
    title: "Parasite",
    overview: "All unemployed, Ki-taek's family takes peculiar interest in the wealthy and glamorous Parks for their livelihood until they get entangled in an unexpected incident.",
    genres: "Comedy, Thriller, Drama",
    vote_average: 8.5,
    vote_count: 16500,
    popularity: 108.0,
    release_date: "2019-05-30",
    poster_path: "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg",
    trailer_key: "5xH0RZE7t4E",
    director: "Bong Joon-ho",
    runtime: 132,
  },
  {
    id: 278,
    title: "The Shawshank Redemption",
    overview: "Framed in the 1940s for the double murder of his wife and her lover, upstanding banker Andy Dufresne begins a new life at the Shawshank prison.",
    genres: "Drama, Crime",
    vote_average: 8.7,
    vote_count: 26000,
    popularity: 140.0,
    release_date: "1994-09-23",
    poster_path: "/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg",
    trailer_key: "PLl99DlL6b4",
    director: "Frank Darabont",
    runtime: 142,
  },
  {
    id: 324857,
    title: "Spider-Man: Into the Spider-Verse",
    overview: "Miles Morales is juggling his life between being a high school student and being a spider-man when he crosses paths with five counterparts from other dimensions.",
    genres: "Animation, Action, Adventure, Science Fiction",
    vote_average: 8.4,
    vote_count: 14500,
    popularity: 120.0,
    release_date: "2018-12-06",
    poster_path: "/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
    trailer_key: "tg52up16eq0",
    director: "Bob Persichetti, Peter Ramsey",
    runtime: 117,
  },
  {
    id: 129,
    title: "Spirited Away",
    overview: "A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had.",
    genres: "Animation, Family, Fantasy",
    vote_average: 8.5,
    vote_count: 15000,
    popularity: 92.0,
    release_date: "2001-07-20",
    poster_path: "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg",
    trailer_key: "ByXuk9QqQkk",
    director: "Hayao Miyazaki",
    runtime: 125,
  },
  {
    id: 98,
    title: "Gladiator",
    overview: "In the year 180, the death of emperor Marcus Aurelius throws the Roman Empire into turmoil. Maximus Decimus Meridius is betrayed and becomes a gladiator.",
    genres: "Action, Drama, Adventure",
    vote_average: 8.2,
    vote_count: 16800,
    popularity: 88.0,
    release_date: "2000-05-01",
    poster_path: "/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg",
    trailer_key: "owK1qxDselE",
    director: "Ridley Scott",
    runtime: 155,
  },
  {
    id: 19995,
    title: "Avatar",
    overview: "In the 22nd century, a paraplegic Marine is dispatched to the moon Pandora on a unique mission, but becomes torn between following orders and protecting an alien civilization.",
    genres: "Action, Adventure, Fantasy, Science Fiction",
    vote_average: 7.6,
    vote_count: 29800,
    popularity: 110.0,
    release_date: "2009-12-15",
    poster_path: "/kyeqWdyUXW608qlYkRqosgbbJyK.jpg",
    trailer_key: "5PSNL1qE6VY",
    director: "James Cameron",
    runtime: 162,
  },
  {
    id: 597,
    title: "Titanic",
    overview: "101-year-old Rose DeWitt Bukater tells the story of her life aboard the Titanic, 84 years later. A young Rose boards the ship with her mother and fiance.",
    genres: "Drama, Romance",
    vote_average: 7.9,
    vote_count: 23700,
    popularity: 102.0,
    release_date: "1997-11-18",
    poster_path: "/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg",
    trailer_key: "2e-eXJ6HgkQ",
    director: "James Cameron",
    runtime: 194,
  },
  {
    id: 550,
    title: "Fight Club",
    overview: "An insomniac office worker looking for a way to change his life crosses paths with a devil-may-care soap maker.",
    genres: "Drama, Thriller",
    vote_average: 8.4,
    vote_count: 27200,
    popularity: 98.4,
    release_date: "1999-10-15",
    poster_path: "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
    trailer_key: "qtRKdVHc-cE",
    director: "David Fincher",
    runtime: 139,
  },
  {
    id: 244786,
    title: "Whiplash",
    overview: "Under the direction of a ruthless instructor, a talented young drummer begins to pursue perfection at any cost, even his humanity.",
    genres: "Drama, Music",
    vote_average: 8.4,
    vote_count: 13800,
    popularity: 85.0,
    release_date: "2014-10-10",
    poster_path: "/7fn624j5lj3xTme2SgiLCeuedmO.jpg",
    trailer_key: "7d_jQycdQGo",
    director: "Damien Chazelle",
    runtime: 107,
  },
  {
    id: 335984,
    title: "Blade Runner 2049",
    overview: "Thirty years after the events of the first film, a new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what's left of society into chaos.",
    genres: "Science Fiction, Drama",
    vote_average: 7.9,
    vote_count: 12500,
    popularity: 95.0,
    release_date: "2017-10-04",
    poster_path: "/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg",
    trailer_key: "gCcx85zbxz4",
    director: "Denis Villeneuve",
    runtime: 164,
  },
  {
    id: 769,
    title: "GoodFellas",
    overview: "The true story of Henry Hill, a half-Irish, half-Sicilian Brooklyn kid who is adopted by neighborhood gangsters at an early age and climbs the ranks of a Mafia family.",
    genres: "Drama, Crime",
    vote_average: 8.5,
    vote_count: 11800,
    popularity: 78.0,
    release_date: "1990-09-12",
    poster_path: "/aKuFiU82s5ISJpGZp7YkIr3kCUd.jpg",
    trailer_key: "2ilzidi_J8Q",
    director: "Martin Scorsese",
    runtime: 145,
  },
  {
    id: 807,
    title: "Seven",
    overview: "Two homicide detectives are on a desperate hunt for a serial killer whose crimes are based on the 'seven deadly sins'.",
    genres: "Crime, Mystery, Thriller",
    vote_average: 8.4,
    vote_count: 19400,
    popularity: 84.0,
    release_date: "1995-09-22",
    poster_path: "/69Sns8WoET6CfaYlIkHbla4l7nC.jpg",
    trailer_key: "znmZoVkCjpI",
    director: "David Fincher",
    runtime: 127,
  },
  {
    id: 13,
    title: "Forrest Gump",
    overview: "A man with a low IQ has accomplished great things in his life and been present during significant historic events—in each case, far exceeding what anyone imagined he could do.",
    genres: "Comedy, Drama, Romance",
    vote_average: 8.5,
    vote_count: 25500,
    popularity: 115.0,
    release_date: "1994-07-06",
    poster_path: "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg",
    trailer_key: "bLvqoHBptjg",
    director: "Robert Zemeckis",
    runtime: 142,
  },
  {
    id: 329,
    title: "Jurassic Park",
    overview: "A wealthy entrepreneur secretly creates a theme park featuring living dinosaurs drawn from prehistoric DNA.",
    genres: "Adventure, Science Fiction",
    vote_average: 7.9,
    vote_count: 15300,
    popularity: 90.0,
    release_date: "1993-06-11",
    poster_path: "/oU7Oq2kFAAlGqbU4VoAE36g4hoI.jpg",
    trailer_key: "lc0UehYemQA",
    director: "Steven Spielberg",
    runtime: 127,
  },
  {
    id: 105,
    title: "Back to the Future",
    overview: "Eighties teenager Marty McFly is accidentally sent back in time to 1955 in a plutonium-powered DeLorean by his eccentric scientist friend Doc Brown.",
    genres: "Adventure, Comedy, Science Fiction",
    vote_average: 8.3,
    vote_count: 18500,
    popularity: 88.0,
    release_date: "1985-07-03",
    poster_path: "/fNOH9f1aA7XRTzl1sAOx9iF553Q.jpg",
    trailer_key: "qvsgGtivCgs",
    director: "Robert Zemeckis",
    runtime: 116,
  },
  {
    id: 354912,
    title: "Coco",
    overview: "Despite his family’s baffling generations-old ban on music, Miguel dreams of becoming an accomplished musician like his idol, Ernesto de la Cruz.",
    genres: "Animation, Family, Music, Adventure",
    vote_average: 8.2,
    vote_count: 17900,
    popularity: 94.0,
    release_date: "2017-10-27",
    poster_path: "/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg",
    trailer_key: "Rvr68u6k5sI",
    director: "Lee Unkrich",
    runtime: 105,
  },
  {
    id: 348,
    title: "Alien",
    overview: "During its return to the earth, the commercial spaceship Nostromo intercepts a distress signal from a distant planet and discovers a deadly extraterrestrial life form.",
    genres: "Horror, Science Fiction",
    vote_average: 8.1,
    vote_count: 13400,
    popularity: 76.0,
    release_date: "1979-05-25",
    poster_path: "/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg",
    trailer_key: "LjLamj-b0I8",
    director: "Ridley Scott",
    runtime: 117,
  },
  {
    id: 274,
    title: "The Silence of the Lambs",
    overview: "Clarice Starling is a top student at the FBI's training academy. Jack Crawford wants Clarice to interview Dr. Hannibal Lecter, a brilliant psychiatrist who is also a violent psychopath.",
    genres: "Crime, Drama, Thriller",
    vote_average: 8.3,
    vote_count: 14900,
    popularity: 82.0,
    release_date: "1991-02-01",
    poster_path: "/uS9m8OBk1A8eM9I042bx8XXpqAq.jpg",
    trailer_key: "W6Mm8Sbe__o",
    director: "Jonathan Demme",
    runtime: 118,
  },
  {
    id: 299534,
    title: "Avengers: Endgame",
    overview: "After the devastating events of Avengers: Infinity War, the universe is in ruins. With the help of remaining allies, the Avengers assemble once more to reverse Thanos' actions.",
    genres: "Adventure, Science Fiction, Action",
    vote_average: 8.3,
    vote_count: 23800,
    popularity: 155.0,
    release_date: "2019-04-24",
    poster_path: "/or06FN3Dka5tukK1e9sl16pB3iy.jpg",
    trailer_key: "TcMBFSGVi1c",
    director: "Anthony Russo, Joe Russo",
    runtime: 181,
  },
  {
    id: 346698,
    title: "Barbie",
    overview: "Barbie and Ken are having the time of their lives in the colorful and seemingly perfect world of Barbie Land. However, when they get a chance to go to the real world, they soon discover the joys and perils of living among humans.",
    genres: "Comedy, Adventure",
    vote_average: 7.1,
    vote_count: 8400,
    popularity: 135.0,
    release_date: "2023-07-19",
    poster_path: "/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg",
    trailer_key: "pBk4NYhWNMM",
    director: "Greta Gerwig",
    runtime: 114,
  },
  {
    id: 120,
    title: "The Lord of the Rings: The Fellowship of the Ring",
    overview: "Young hobbit Frodo Baggins, after inheriting a mysterious ring from his uncle Bilbo, must leave his home to destroy it.",
    genres: "Adventure, Fantasy, Action",
    vote_average: 8.4,
    vote_count: 23500,
    popularity: 130.0,
    release_date: "2001-12-18",
    poster_path: "/6oom5QYQ2yQTMJIbnvbkBL9cDK6.jpg",
    trailer_key: "V75dMMW-qqc",
    director: "Peter Jackson",
    runtime: 178,
  },
  {
    id: 122,
    title: "The Lord of the Rings: The Return of the King",
    overview: "As armies mass for a final battle that will decide the fate of the world, one member of the Fellowship of the Ring is revealed as the noble heir to the throne of Men.",
    genres: "Adventure, Fantasy, Action",
    vote_average: 8.5,
    vote_count: 22400,
    popularity: 125.0,
    release_date: "2003-12-01",
    poster_path: "/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg",
    trailer_key: "r5X-hFf6Bwo",
    director: "Peter Jackson",
    runtime: 201,
  },
];

function loadCachedShowcaseMovies(): Movie[] {
  try {
    const raw = safeGetLocalStorage(SHOWCASE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Movie[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 30);
    }
  } catch {}
  return SEED_SHOWCASE_MOVIES;
}

function saveCachedShowcaseMovies(movies: Movie[]) {
  try {
    if (movies.length > 0) {
      safeSetLocalStorage(SHOWCASE_STORAGE_KEY, JSON.stringify(movies.slice(0, 30)));
    }
  } catch {}
}

function loadCachedLatestMovies(): Movie[] {
  try {
    const raw = safeGetLocalStorage(LATEST_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Movie[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 30);
    }
  } catch {}
  return SEED_SHOWCASE_MOVIES.slice().reverse();
}

function saveCachedLatestMovies(movies: Movie[]) {
  try {
    if (movies.length > 0) {
      safeSetLocalStorage(LATEST_STORAGE_KEY, JSON.stringify(movies.slice(0, 30)));
    }
  } catch {}
}

function createSessionId(): string {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getSessionId(): string {
  try {
    const existing = safeGetSessionStorage(SESSION_STORAGE_KEY);
    if (existing) return existing;
    const next = createSessionId();
    safeSetSessionStorage(SESSION_STORAGE_KEY, next);
    return next;
  } catch {
    return createSessionId();
  }
}

function StatusBadge({
  state,
  backend,
}: {
  state: CatalogState;
  backend: string;
}) {
  const isBusy = state === "booting" || state === "warming";
  const Icon = state === "ready" ? CheckCircle2 : state === "error" ? AlertTriangle : Loader2;
  return (
    <div className={`status-badge ${state}`} title={backendLabel(backend)}>
      <Icon size={17} className={isBusy ? "spin" : undefined} />
      <span>{state === "ready" ? "Live" : state === "warming" ? "Warming" : state === "error" ? "Retrying" : "Connecting"}</span>
      <strong>{serviceLabel(backend)}</strong>
    </div>
  );
}

function MetricTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="metric-tile">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function healthLabel(health: ArtifactHealth | null): string {
  if (!health) return "Pending";
  if (health.status === "ready") return "Ready";
  if (health.status === "degraded") return "Degraded";
  if (health.status === "unavailable") return "Unavailable";
  return health.status || "Unknown";
}

function checkValue(value: unknown): string {
  if (value === true) return "OK";
  if (value === false) return "Fail";
  if (value === null || value === undefined) return "N/A";
  return String(value);
}

function percentValue(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return `${Math.round(value * 100)}%`;
}

function decimalValue(value?: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "N/A";
  return value.toFixed(3);
}

function shortId(value?: string | null): string {
  if (!value) return "Session";
  return value.length > 12 ? value.slice(0, 12) : value;
}

function qualityLabel(report: SemanticBenchmark | null): string {
  if (!report) return "Pending";
  if (report.status === "unavailable") return "Unavailable";
  const hitRate = report.metrics?.hit_rate_at_k;
  return typeof hitRate === "number" ? `${Math.round(hitRate * 100)}% hit` : report.status;
}

function titleCaseStatus(status?: string | null): string {
  if (!status) return "Pending";
  return status
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function readinessLabel(report: PlatformReadiness | null): string {
  if (!report) return "Pending";
  return titleCaseStatus(report.status);
}

function readinessSummaryText(report: PlatformReadiness | null): string {
  if (!report) return "Waiting for strict readiness";
  const summary = report.summary || {};
  const ok = Number(summary.ok_count || 0);
  const total = Number(summary.component_count || report.components?.length || 0);
  const failed = Number(summary.failed_required_count || 0);
  if (report.status === "ready") return `${ok}/${total} checks passing`;
  if (failed > 0) return `${failed} required check${failed === 1 ? "" : "s"} failing`;
  return `${ok}/${total} checks passing`;
}

function ReadinessPanel({
  report,
  loading,
  onRefresh,
}: {
  report: PlatformReadiness | null;
  loading: boolean;
  onRefresh: () => void;
}) {
  const components = report?.components || [];
  const summary = report?.summary || {};
  const visibleComponents = [...components]
    .sort((left, right) => {
      const leftOk = left.status === "ok" ? 1 : 0;
      const rightOk = right.status === "ok" ? 1 : 0;
      if (leftOk !== rightOk) return leftOk - rightOk;
      if (left.required !== right.required) return left.required ? -1 : 1;
      return left.name.localeCompare(right.name);
    })
    .slice(0, 6);

  return (
    <div className={`readiness-panel ${report?.status || "pending"}`}>
      <div className="section-mini-title">
        <span>Platform readiness</span>
        <button className="panel-icon-button" type="button" onClick={onRefresh} title="Refresh readiness">
          <RefreshCw size={14} className={loading ? "spin" : undefined} />
        </button>
      </div>
      <div className="readiness-headline">
        <strong>{readinessLabel(report)}</strong>
        <span>{readinessSummaryText(report)}</span>
      </div>
      <div className="readiness-metrics">
        <div>
          <span>Components</span>
          <strong>
            {Number(summary.ok_count || 0)}/{Number(summary.component_count || components.length || 0)}
          </strong>
        </div>
        <div>
          <span>Required failures</span>
          <strong>{Number(summary.failed_required_count || 0)}</strong>
        </div>
      </div>
      {visibleComponents.length > 0 && (
        <div className="component-list">
          {visibleComponents.map((component) => (
            <div className={`component-row ${component.status}`} key={component.name}>
              <span>{component.name.replaceAll("_", " ")}</span>
              <strong>{titleCaseStatus(component.status)}</strong>
            </div>
          ))}
        </div>
      )}
      {report?.app?.commit && <div className="quiet-line">Revision {report.app.commit.slice(0, 7)}</div>}
    </div>
  );
}

function DiagnosticsPanel({ health }: { health: ArtifactHealth | null }) {
  const checks = health?.checks || {};
  const rows = [
    ["Catalog", checks.metadata_ready],
    ["Vectors", checks.vector_files_ready],
    ["ID map", checks.catalog_vector_aligned],
    ["Semantic twins", checks.semantic_catalog_aligned],
    ["Summary", checks.semantic_summary_aligned],
  ];
  return (
    <div className={`diagnostics-panel ${health?.status || "pending"}`}>
      <div className="section-mini-title">
        <span>Artifact health</span>
        <small>{healthLabel(health)}</small>
      </div>
      <div className="diagnostic-rows">
        {rows.map(([label, value]) => (
          <div className="diagnostic-row" key={String(label)}>
            <span>{label}</span>
            <strong>{checkValue(value)}</strong>
          </div>
        ))}
      </div>
      {health?.run_date && <div className="quiet-line">Snapshot {health.run_date}</div>}
    </div>
  );
}

function QualityPanel({ report }: { report: SemanticBenchmark | null }) {
  const metrics = report?.metrics || {};
  const rows = [
    ["Hit rate", percentValue(metrics.hit_rate_at_k)],
    ["MRR", decimalValue(metrics.mrr_at_k)],
    ["NDCG", decimalValue(metrics.ndcg_at_k)],
    ["Bad matches", percentValue(metrics.bad_match_rate_at_k)],
    ["Explanations", percentValue(metrics.explanation_coverage)],
  ];
  return (
    <div className={`quality-panel ${report?.status || "pending"}`}>
      <div className="section-mini-title">
        <span>Serving quality</span>
        <small>{report?.status || "Pending"}</small>
      </div>
      <div className="diagnostic-rows">
        {rows.map(([label, value]) => (
          <div className="diagnostic-row" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      {report?.evaluated_case_count ? <div className="quiet-line">{report.evaluated_case_count} benchmark cases</div> : null}
    </div>
  );
}

const prefetchedMovieIds = new Set<number>();
let prefetchDebounceTimer: ReturnType<typeof setTimeout> | null = null;

export function prefetchMovie(movieId: number): void {
  if (!movieId || prefetchedMovieIds.has(movieId)) return;
  if (prefetchDebounceTimer) {
    clearTimeout(prefetchDebounceTimer);
  }
  prefetchDebounceTimer = setTimeout(() => {
    prefetchedMovieIds.add(movieId);
    void apiGet("/movie/" + movieId);
    void apiGet("/v1/recommendations/id/" + movieId, { n: 5 });
  }, 50);
}

const MoviePoster = React.memo(function MoviePoster({
  movie,
  onSelect,
}: {
  movie: Movie;
  onSelect: (movie: Movie) => void;
}) {
  return (
    <button
      className="poster-card"
      type="button"
      onClick={() => onSelect(movie)}
      onPointerEnter={() => prefetchMovie(movie.id)}
      title={movie.title}
    >
      <img src={posterUrl(movie.poster_path)} alt={movie.title} loading="lazy" />
    </button>
  );
});

const RecommendationCard = React.memo(function RecommendationCard({
  movie,
  rank,
  onSelect,
  feedback,
  onFeedback,
}: {
  movie: Movie;
  rank?: number;
  onSelect: (movie: Movie) => void;
  feedback?: FeedbackValue;
  onFeedback: (movie: Movie, value: FeedbackValue) => void;
}) {
  const reasons = movieReasons(movie);
  const semantic = semanticPercent(movie);
  const chips = evidenceChips(movie);
  return (
    <article className="recommendation-card">
      <div className="card-media">
        <MoviePoster movie={movie} onSelect={onSelect} />
        {rank ? <span className="rank-pill">#{rank}</span> : null}
      </div>
      <div className="recommendation-body">
        <div className="card-title-row">
          <strong>{movie.title}</strong>
          <span>{movieYear(movie)}</span>
        </div>
        <div className="signal-row">
          <span>
            <Gauge size={14} />
            {confidence(movie)}
          </span>
          <span>
            <Star size={14} fill="currentColor" />
            {movieScore(movie)}
          </span>
          {semantic && (
            <span>
              <Sparkles size={14} />
              {semantic}
            </span>
          )}
        </div>
        <div className="genre-line">{compactGenres(movie.genres)}</div>
        {/* Retrieval stage badge — Requirements 7.1, 7.2 */}
        {movie.retrieval_stage && (
          <div className="retrieval-stage-badge" aria-label={`Retrieved via ${movie.retrieval_stage}`}>
            {cleanStage(movie.retrieval_stage)}
          </div>
        )}
        {/* Retrieval signals — Requirements 7.3 */}
        {movie.retrieval_signals && Object.keys(movie.retrieval_signals).length > 0 && (
          <dl className="retrieval-signals-dl" aria-label="Retrieval signals">
            {Object.entries(movie.retrieval_signals)
              .filter(([, v]) => v != null && typeof v !== "object")
              .slice(0, 3)
              .map(([k, v]) => (
                <div key={k} className="retrieval-signal-row">
                  <dt>{k.replaceAll("_", " ")}</dt>
                  <dd>{typeof v === "number" ? (v as number).toFixed(3) : String(v)}</dd>
                </div>
              ))}
          </dl>
        )}
        {/* Explanation text — Requirements 7.4 */}
        {movie.explanation_text && (
          <p className="card-explanation" aria-label="AI explanation">{movie.explanation_text}</p>
        )}
        {chips.length > 0 && (
          <div className="evidence-chips">
            {chips.map((chip) => (
              <span key={chip}>{chip}</span>
            ))}
          </div>
        )}
        {reasons.length > 0 && <p>{reasons[0]}</p>}
        <div className="feedback-row" role="group" aria-label={`Feedback for ${movie.title}`}>
          <button
            className={feedback === "positive" ? "active positive" : ""}
            type="button"
            title="More like this"
            onClick={() => onFeedback(movie, "positive")}
          >
            <ThumbsUp size={14} />
            <span>More</span>
          </button>
          <button
            className={feedback === "negative" ? "active negative" : ""}
            type="button"
            title="Less like this"
            onClick={() => onFeedback(movie, "negative")}
          >
            <ThumbsDown size={14} />
            <span>Less</span>
          </button>
        </div>
      </div>
    </article>
  );
});

function ResultContextBar({
  kind,
  backend,
  sourceMovie,
  requestId,
  query,
}: {
  kind: ResultsKind;
  backend: string;
  sourceMovie: Movie | null;
  requestId: string | null;
  query: string;
}) {
  const sourceLabel =
    kind === "recommendations"
      ? sourceMovie?.title || "Selected title"
      : query.trim() || "Catalog query";
  return (
    <div className="result-context" aria-label="Result context">
      <span>
        <Film size={14} />
        {sourceLabel}
      </span>
      {kind === "recommendations" && (
        <span>
          <Sparkles size={14} />
          {shortId(requestId)}
        </span>
      )}
      <span>
        <Server size={14} />
        {serviceLabel(backend)}
      </span>
    </div>
  );
}

const MovieSpotlight = React.memo(function MovieSpotlight({
  movie,
  loading,
  onRecommend,
  userId,
  sessionId,
}: {
  movie: Movie;
  loading: boolean;
  onRecommend: () => void;
  userId: string | null;
  sessionId: string;
}) {
  const [likedStatus, setLikedStatus] = React.useState<"none" | "liked" | "disliked">("none");
  const reasons = movieReasons(movie);
  const semantic = semanticPercent(movie);
  const chips = evidenceChips(movie);
  return (
    <section
      className="spotlight"
      style={{ "--poster-bg": `url(${posterUrl(movie.poster_path)})` } as React.CSSProperties}
    >
      <div className="poster-column">
        <img className="detail-poster" src={posterUrl(movie.poster_path)} alt={movie.title} />
        <div className="poster-stat">
          <Star size={16} fill="currentColor" />
          <span>{movieScore(movie)}</span>
          <small>{formatCount(movie.vote_count)} votes</small>
        </div>
      </div>
      <div className="spotlight-copy">
        <div className="eyebrow">
          <Film size={15} />
          {compactGenres(movie.genres)}
        </div>
        <h1>{movie.title}</h1>
        <div className="meta-row">
          <span>
            <Clock3 size={15} />
            {movieYear(movie)}
          </span>
          <span>
            <TrendingUp size={15} />
            Popularity {formatCount(movie.popularity)}
          </span>
          <span>
            <WandSparkles size={15} />
            {cleanStage(movie.retrieval_stage)}
          </span>
          {semantic && (
            <span>
              <Sparkles size={15} />
              {semantic}
            </span>
          )}
        </div>
        <p>{movie.overview || "No overview is available for this title."}</p>

        <div className="interaction-panel">
          <button
            className={`interaction-btn ${likedStatus === "liked" ? "active-like" : ""}`}
            title="Like this movie"
            onClick={async () => {
              try {
                await recordEvent({
                  user_id: userId ?? undefined,
                  event_type: "rating",
                  movie_id: movie.id,
                  rating: 5.0,
                  session_id: sessionId,
                });
                setLikedStatus("liked");
              } catch (e) {
                console.error("Failed to rate", e);
              }
            }}
          >
            <ThumbsUp size={16} fill={likedStatus === "liked" ? "currentColor" : "none"} /> Like
          </button>
          <button
            className={`interaction-btn ${likedStatus === "disliked" ? "active-dislike" : ""}`}
            title="Dislike this movie"
            onClick={async () => {
              try {
                await recordEvent({
                  user_id: userId ?? undefined,
                  event_type: "rating",
                  movie_id: movie.id,
                  rating: 1.0,
                  session_id: sessionId,
                });
                setLikedStatus("disliked");
              } catch (e) {
                console.error("Failed to rate", e);
              }
            }}
          >
            <ThumbsDown size={16} fill={likedStatus === "disliked" ? "currentColor" : "none"} /> Dislike
          </button>
        </div>

        {reasons.length > 0 && (
          <div className="reason-panel">
            <strong>Why it matched</strong>
            {reasons.map((reason) => (
              <span key={reason}>{reason}</span>
            ))}
            {chips.length > 0 && (
              <div className="evidence-chips wide">
                {chips.map((chip) => (
                  <span key={chip}>{chip}</span>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="action-row">
          <button className="primary-action" type="button" onClick={onRecommend} disabled={loading}>
            {loading ? <Loader2 size={18} className="spin" /> : <Sparkles size={18} />}
            {loading ? "Getting similar recommendations" : "Get Similar Recommendations"}
          </button>
          {(movie.trailer_key || KNOWN_TRAILERS[movie.id]) && (
            <a className="ghost-action" href={`https://www.youtube.com/watch?v=${movie.trailer_key || KNOWN_TRAILERS[movie.id]}`} target="_blank" rel="noreferrer">
              <Play size={18} />
              Trailer
            </a>
          )}
        </div>
      </div>
    </section>
  );
});

function TrailerFrame({
  movie,
  initialTrailerKey,
  interactive = false,
}: {
  movie: Movie;
  initialTrailerKey?: string | null;
  interactive?: boolean;
}) {
  const [playing, setPlaying] = React.useState(true);
  const [isMuted, setIsMuted] = React.useState(!interactive);
  const [trailerKey, setTrailerKey] = React.useState<string | null>(
    initialTrailerKey || movie.trailer_key || KNOWN_TRAILERS[movie.id] || null
  );
  const [videoError, setVideoError] = React.useState(false);
  const [isCached, setIsCached] = React.useState<boolean | null>(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const [isMobile, setIsMobile] = React.useState(() => typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  const [isTabVisible, setIsTabVisible] = React.useState(true);

  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const handleVisibility = () => {
      const visible = document.visibilityState === "visible";
      setIsTabVisible(visible);
      if (!visible && videoRef.current) {
        videoRef.current.pause();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  React.useEffect(() => {
    const currentVideo = videoRef.current;
    return () => {
      if (currentVideo) {
        currentVideo.pause();
      }
    };
  }, []);

  React.useEffect(() => {
    const key = initialTrailerKey || movie.trailer_key || KNOWN_TRAILERS[movie.id] || null;
    setTrailerKey(key);
    if (!key) {
      getMovieEnriched(movie.id)
        .then((res) => {
          if (res.data.trailer_key) setTrailerKey(res.data.trailer_key);
        })
        .catch(() => {});
    }
  }, [movie.id, movie.trailer_key, initialTrailerKey]);

  // Check if trailer is cached when trailerKey changes
  React.useEffect(() => {
    if (!trailerKey) {
      setIsCached(false);
      return;
    }
    checkVideoCacheStatus(trailerKey)
      .then((res) => {
        if (res.data.cached) {
          setIsCached(true);
        }
      })
      .catch(() => {
        setIsCached(false);
      });
  }, [trailerKey]);

  // Handle window resizing to toggle video playback on mobile
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Restart playback and reload video when movie, trailerKey, or isCached changes
  React.useEffect(() => {
    setPlaying(true);
    setVideoError(false);
    if (isCached && videoRef.current && !isMobile) {
      videoRef.current.load();
      videoRef.current.play().catch(() => {});
    }
  }, [movie.id, trailerKey, isCached, isMobile]);

  function togglePlayback() {
    const nextPlaying = !playing;
    if (videoRef.current) {
      if (nextPlaying) {
        videoRef.current.play().catch(() => {});
      } else {
        videoRef.current.pause();
      }
    }
    setPlaying(nextPlaying);
  }

  const backendUrl = currentBackend();
  const videoSrc = trailerKey ? `${backendUrl}/v1/videos/stream/${trailerKey}` : "";

  return (
    <div className={`trailer-frame ${interactive ? "interactive-trailer" : ""}`} style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#05060b" }}>
      {!isTabVisible ? (
        <>
          <img src={backdropUrl(movie.poster_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div className="trailer-overlay" />
        </>
      ) : trailerKey ? (
        interactive ? (
          /* Interactive cinema player with controls and audio toggle */
          <div style={{ position: "relative", width: "100%", height: "100%", background: "#000" }}>
            <iframe
              key={`interactive-${trailerKey}-${isMuted ? "muted" : "unmuted"}`}
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=${isMuted ? 1 : 0}&controls=1&modestbranding=1&rel=0&playsinline=1&enablejsapi=1`}
              title={`${movie.title} Trailer`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                display: "block",
                border: "none",
                zIndex: 2,
                pointerEvents: "auto",
              }}
            />
            {isMuted && (
              <button
                type="button"
                className="unmute-trailer-pill"
                onClick={() => setIsMuted(false)}
                style={{
                  position: "absolute",
                  bottom: "14px",
                  right: "14px",
                  zIndex: 10,
                  background: "rgba(15, 23, 42, 0.88)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "20px",
                  padding: "6px 14px",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  cursor: "pointer",
                  backdropFilter: "blur(12px)",
                  boxShadow: "0 4px 14px rgba(0, 0, 0, 0.5)",
                }}
                aria-label="Unmute trailer audio"
              >
                <Volume2 size={15} />
                <span>Unmute Audio</span>
              </button>
            )}
          </div>
        ) : isMobile ? (
          /* Mobile: YouTube iframe embed scaled to hide player chrome */
          <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000", pointerEvents: "none" }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&loop=1&playlist=${trailerKey}`}
              title={`${movie.title} Trailer`}
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              style={{
                position: "absolute",
                top: "-12%",
                left: "-12%",
                width: "124%",
                height: "124%",
                display: "block",
                border: "none",
                zIndex: 1,
                pointerEvents: "none",
              }}
            />
            <div className="trailer-overlay" />
          </div>
        ) : (
          /* Desktop: cached video first, YouTube iframe fallback */
          (!isCached || videoError) ? (
            <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden", background: "#000", pointerEvents: "none" }}>
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${trailerKey}?autoplay=1&mute=1&controls=0&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&disablekb=1&fs=0&loop=1&playlist=${trailerKey}`}
                title={`${movie.title} Trailer`}
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                style={{
                  position: "absolute",
                  top: "-12%",
                  left: "-12%",
                  width: "124%",
                  height: "124%",
                  display: "block",
                  border: "none",
                  zIndex: 1,
                  pointerEvents: "none",
                }}
              />
              <div className="trailer-overlay" />
            </div>
          ) : (
            <>
              <video
                ref={videoRef}
                src={videoSrc}
                autoPlay
                muted
                loop
                playsInline
                poster={backdropUrl(movie.poster_path)}
                onError={() => setVideoError(true)}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", pointerEvents: "none" }}
              />
              <div className="trailer-overlay" />
            </>
          )
        )
      ) : (
        /* No trailer key — static poster */
        <>
          <img src={backdropUrl(movie.poster_path)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          <div className="trailer-overlay" />
        </>
      )}
      {trailerKey && isCached && !videoError && !isMobile && !interactive && (
        <button className="video-toggle" type="button" onClick={togglePlayback} aria-label={playing ? "Pause trailer" : "Play trailer"}>
          <span className="visually-hidden">{playing ? "Pause trailer" : "Play trailer"}</span>
        </button>
      )}
    </div>
  );
}

function RatingCircle({ score }: { score: string }) {
  const numScore = score === "NR" ? 0 : Number(score) || 0;
  const percent = numScore * 10;
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percent / 100) * circumference;

  let strokeColor = "var(--danger)";
  if (numScore >= 7) strokeColor = "var(--success)";
  else if (numScore >= 5) strokeColor = "var(--warn)";

  return (
    <div className="modern-rating-badge" aria-label={score === "NR" ? "Not Rated" : `Rating ${score} out of 10`}>
      <svg className="rating-svg" viewBox="0 0 44 44">
        <circle
          className="rating-track"
          cx="22"
          cy="22"
          r={radius}
          fill="transparent"
          stroke="rgba(255, 255, 255, 0.08)"
          strokeWidth="3"
        />
        {score !== "NR" && (
          <circle
            className="rating-fill"
            cx="22"
            cy="22"
            r={radius}
            fill="transparent"
            stroke={strokeColor}
            strokeWidth="3"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform="rotate(-90 22 22)"
          />
        )}
      </svg>
      <div className="rating-value">
        <span>{score}</span>
      </div>
    </div>
  );
}

export const MovieDialog = React.memo(function MovieDialog({
  movie,
  onClose,
  feedback,
  onFeedback,
  onRating,
}: {
  movie: Movie;
  onClose: () => void;
  feedback?: "positive" | "negative";
  onFeedback?: (movie: Movie, value: "positive" | "negative") => void;
  onRating?: (movie: Movie, stars: number) => void;
}) {
  const director = directorLabel(movie);
  const cast = movie.cast || "";
  const genreList = Array.isArray(movie.genres)
    ? movie.genres.map((g) => String(g).trim()).filter(Boolean)
    : typeof movie.genres === "string"
      ? movie.genres.split(/[,|]/).map((g) => g.trim()).filter(Boolean)
      : [];
  const runtime = movie.runtime ? `${movie.runtime} min` : "";
  const overview = movie.overview || "No overview is available for this title.";
  const explanation = movie.explanation_text || movieReasons(movie).join(" | ");
  const rating = movieScore(movie);

  // Masterpiece States
  const [userRating, setUserRating] = React.useState(0);
  const [hoverRating, setHoverRating] = React.useState(0);
  const WATCHLIST_STORAGE_KEY = "nova_watchlist_v2";
  const [inWatchlist, setInWatchlist] = React.useState(() => {
    try {
      const raw = safeGetLocalStorage(WATCHLIST_STORAGE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) && list.some((m: { id?: number }) => m.id === movie.id);
    } catch {
      return false;
    }
  });
  const [toast, setToast] = React.useState("");
  const [currentTrailerKey, setCurrentTrailerKey] = React.useState<string | null>(
    movie.trailer_key || KNOWN_TRAILERS[movie.id] || null
  );

  React.useEffect(() => {
    const initialKey = movie.trailer_key || KNOWN_TRAILERS[movie.id] || null;
    setCurrentTrailerKey(initialKey);
    if (!initialKey) {
      getMovieEnriched(movie.id)
        .then((res) => {
          if (res.data.trailer_key) {
            setCurrentTrailerKey(res.data.trailer_key);
          }
        })
        .catch(() => {});
    }
  }, [movie.id, movie.trailer_key]);

  const dialogRef = React.useRef<HTMLElement>(null);
  const previousFocusRef = React.useRef<HTMLElement | null>(null);

  const showToast = React.useCallback((msg: string) => {
    setToast(msg);
  }, []);

  React.useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 2200);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKeyDown);
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    firstFocusable?.focus();
    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="movie-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-glow-aura" style={{ '--movie-backdrop': `url(${backdropUrl(movie.poster_path)})` } as React.CSSProperties} />

      <section ref={dialogRef} className="movie-dialog" role="dialog" aria-modal="true" aria-label={`${movie.title} details`}>
        <div className="mobile-sheet-handle" style={{ width: "36px", height: "5px", background: "rgba(255, 255, 255, 0.15)", borderRadius: "10px", margin: "12px auto 0 auto", display: "none" }} />
        <button className="dialog-close" type="button" aria-label="Close movie details" onClick={onClose}>
          <X size={20} />
        </button>

        <div className="dialog-media">
          <TrailerFrame movie={movie} initialTrailerKey={currentTrailerKey} interactive={true} />
        </div>

        <div className="dialog-content">
          <div className="dialog-grid">
            <div className="dialog-main">
              <div className="dialog-title-row">
                <h2>{movie.title}</h2>
                <RatingCircle score={rating} />
              </div>

              <div className="dialog-meta-row">
                <span className="meta-badge">
                  <Calendar size={14} />
                  <span>{movieYear(movie)}</span>
                </span>
                {runtime && (
                  <span className="meta-badge">
                    <Clock3 size={14} />
                    <span>{runtime}</span>
                  </span>
                )}
                {genreList.map((g) => (
                  <span key={g} className="meta-badge genre">
                    <Film size={14} />
                    <span>{g}</span>
                  </span>
                ))}
                {movie.similarity_score !== undefined && movie.similarity_score !== null && (
                  <span className="meta-badge" style={{ background: "rgba(6, 182, 212, 0.15)", color: "#22d3ee", border: "1px solid rgba(6, 182, 212, 0.25)" }}>
                    <Sparkles size={13} />
                    <span>{formatMatchPercentage(movie.similarity_score)}% Match</span>
                  </span>
                )}
              </div>

              <p className="dialog-overview" style={{ fontSize: "0.95rem", lineHeight: 1.6, color: "#cbd5e1", margin: "14px 0 0 0" }}>
                {overview}
              </p>

              {explanation && (
                <div className="dialog-vibe-card" style={{ marginTop: "16px", padding: "14px 18px", borderRadius: "12px", background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
                  <div className="vibe-header" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <Sparkles size={14} style={{ color: "var(--cyan)" }} />
                    <span style={{ fontSize: "0.8rem", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--cyan)" }}>
                      Why You&apos;ll Love This
                    </span>
                  </div>
                  <p className="vibe-text" style={{ margin: 0, fontSize: "0.88rem", color: "#e2e8f0", lineHeight: 1.5 }}>
                    {explanation}
                  </p>
                </div>
              )}

              {(director || cast) && (
                <div style={{ marginTop: "18px", paddingTop: "14px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", display: "flex", flexDirection: "column", gap: "8px", fontSize: "0.85rem" }}>
                  {director && (
                    <div>
                      <span style={{ color: "var(--muted)", marginRight: "8px" }}>Director</span>
                      <strong style={{ color: "#fff" }}>{director}</strong>
                    </div>
                  )}
                  {cast && (
                    <div>
                      <span style={{ color: "var(--muted)", marginRight: "8px" }}>Starring</span>
                      <span style={{ color: "#cbd5e1" }}>{cast}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="dialog-sidebar">
              {onFeedback && (
                <div className="sidebar-section">
                  <h3>My Vibe</h3>
                  <div className="dialog-feedback-actions">
                    <button
                      type="button"
                      className={`feedback-btn thumbs-up ${feedback === "positive" ? "active" : ""}`}
                      onClick={() => {
                        onFeedback(movie, "positive");
                        showToast("Marked as Liked!");
                      }}
                      aria-label="Thumbs up"
                    >
                      <ThumbsUp size={16} />
                      <span>Like</span>
                    </button>
                    <button
                      type="button"
                      className={`feedback-btn thumbs-down ${feedback === "negative" ? "active" : ""}`}
                      onClick={() => {
                        onFeedback(movie, "negative");
                        showToast("Marked as Disliked.");
                      }}
                      aria-label="Thumbs down"
                    >
                      <ThumbsDown size={16} />
                      <span>Dislike</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="sidebar-section">
                <h3>My Rating</h3>
                <div className="star-rating-container">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      className={`star-btn ${star <= (hoverRating || userRating) ? "filled" : ""}`}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => {
                        setUserRating(star);
                        if (onRating) {
                          onRating(movie, star);
                        }
                        showToast(`Rated ${star} Star${star > 1 ? "s" : ""}! Real-time signal synced.`);
                      }}
                      aria-label={`Rate ${star} stars`}
                    >
                      <Star size={20} fill={star <= (hoverRating || userRating) ? "currentColor" : "none"} />
                    </button>
                  ))}
                </div>
              </div>

              <div className="sidebar-section">
                <h3>Collection</h3>
                <div className="sidebar-actions-grid">
                  <button
                    type="button"
                    className={`action-pill-btn ${inWatchlist ? "active" : ""}`}
                    onClick={() => {
                      try {
                        const raw = safeGetLocalStorage(WATCHLIST_STORAGE_KEY);
                        let list = raw ? JSON.parse(raw) : [];
                        if (!Array.isArray(list)) list = [];
                        const exists = list.some((m: { id?: number }) => m.id === movie.id);
                        if (exists) {
                          list = list.filter((m: { id?: number }) => m.id !== movie.id);
                          safeSetLocalStorage(WATCHLIST_STORAGE_KEY, JSON.stringify(list));
                          setInWatchlist(false);
                          showToast("Removed from Watchlist");
                        } else {
                          list = [movie, ...list.filter((m: { id?: number }) => m.id !== movie.id)];
                          safeSetLocalStorage(WATCHLIST_STORAGE_KEY, JSON.stringify(list));
                          setInWatchlist(true);
                          showToast("Saved to Watchlist!");
                        }
                      } catch {
                        setInWatchlist(!inWatchlist);
                      }
                    }}
                  >
                    <Bookmark size={15} fill={inWatchlist ? "currentColor" : "none"} />
                    <span>{inWatchlist ? "Watchlisted" : "Watchlist"}</span>
                  </button>
                  <button
                    type="button"
                    className="action-pill-btn"
                    onClick={() => {
                      try {
                        navigator.clipboard.writeText(window.location.href);
                        showToast("Copied link to clipboard!");
                      } catch {
                        showToast("Failed to copy link.");
                      }
                    }}
                  >
                    <Share2 size={15} />
                    <span>Share</span>
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
                {currentTrailerKey ? (
                  <a className="dialog-action-btn primary" href={`https://www.youtube.com/watch?v=${currentTrailerKey}`} target="_blank" rel="noreferrer">
                    <Play size={16} fill="currentColor" />
                    <span>Watch Full Trailer</span>
                  </a>
                ) : (
                  <a className="dialog-action-btn primary" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(movie.title + " " + (movie.release_date?.slice(0, 4) || "") + " official trailer")}`} target="_blank" rel="noreferrer">
                    <Play size={16} fill="currentColor" />
                    <span>Find Trailer on YouTube</span>
                  </a>
                )}
                <a
                  className="dialog-action-btn secondary"
                  href={`https://www.themoviedb.org/movie/${movie.id}`}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px" }}
                >
                  <ExternalLink size={14} />
                  <span>View on TMDB</span>
                </a>
              </div>
            </div>
          </div>
        </div>

        {toast && (
          <div className="dialog-toast">
            <Sparkles size={14} />
            <span>{toast}</span>
          </div>
        )}
      </section>
    </div>
  );
});



function CinemaWaveformPulse() {
  return (
    <div className="cinema-waveform" aria-hidden="true">
      <span className="wave-bar wave-bar-1" />
      <span className="wave-bar wave-bar-2" />
      <span className="wave-bar wave-bar-3" />
      <span className="wave-bar wave-bar-4" />
      <span className="wave-bar wave-bar-5" />
    </div>
  );
}

function CinematicRow({
  title,
  subtitle,
  movies,
  variant = "standard",
  isTop10 = false,
  onOpenMovie,
  onHoverMovie,
}: {
  title: string;
  subtitle?: string;
  movies: Movie[];
  variant?: "standard" | "anamorphic" | "vault";
  isTop10?: boolean;
  onOpenMovie: (movie: Movie) => void;
  onHoverMovie?: (movieId?: number) => void;
}) {
  const rowRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(true);

  const effectiveVariant: "standard" | "anamorphic" | "vault" =
    variant !== "standard" ? variant : isTop10 ? "vault" : "standard";

  const checkScroll = React.useCallback(() => {
    const el = rowRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  }, []);

  React.useEffect(() => {
    checkScroll();
    const el = rowRef.current;
    if (!el) return;
    el.addEventListener("scroll", checkScroll, { passive: true });
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll, movies.length]);

  const handleScroll = (direction: "left" | "right") => {
    const el = rowRef.current;
    if (!el) return;
    const distance = el.clientWidth * 0.75;
    el.scrollBy({
      left: direction === "left" ? -distance : distance,
      behavior: "smooth",
    });
  };

  if (!movies || movies.length === 0) return null;

  return (
    <div className={`cinematic-row cinematic-row-${effectiveVariant}`}>
      <div className="row-header">
        <h3 className="row-title">{title}</h3>
        {subtitle && <span className="row-subtitle">{subtitle}</span>}
      </div>
      <div className="carousel-wrapper">
        {canScrollLeft && (
          <button
            type="button"
            className="carousel-arrow carousel-arrow-left"
            onClick={() => handleScroll("left")}
            aria-label={`Scroll ${title} left`}
          >
            <ChevronLeft size={24} />
          </button>
        )}
        <div className="carousel-track" ref={rowRef}>
          {movies.map((movie, index) => {
            if (effectiveVariant === "vault") {
              return (
                <div
                  key={`${title}-${movie.id}-${index}`}
                  className="vault-card-container"
                >
                  <button
                    type="button"
                    className="vault-movie-card"
                    onClick={() => onOpenMovie(movie)}
                    onPointerEnter={() => prefetchMovie(movie.id)}
                    onMouseEnter={() => onHoverMovie?.(movie.id)}
                    onFocus={() => onHoverMovie?.(movie.id)}
                    title={`${movie.title} (${movieYear(movie)}) - Watch Trailer`}
                  >
                    <div className="vault-poster-wrap">
                      <img
                        src={posterUrl(movie.poster_path)}
                        alt={movie.title}
                        loading="lazy"
                        className="card-poster"
                      />
                      <div className="card-overlay-gradient" />
                      <div className="card-quick-badge">
                        <Play size={12} fill="currentColor" />
                      </div>
                    </div>
                    <div className="card-caption">
                      <span className="card-caption-title">{movie.title}</span>
                      <div className="card-caption-meta">
                        <span>{movieYear(movie)}</span>
                        {directorLabel(movie) && <span>• {directorLabel(movie)}</span>}
                        {movieScore(movie) !== "NR" && (
                          <span className="card-caption-score">★ {movieScore(movie)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            }

            if (effectiveVariant === "anamorphic") {
              return (
                <div
                  key={`${title}-${movie.id}-${index}`}
                  className="anamorphic-card-container"
                >
                  <button
                    type="button"
                    className="anamorphic-movie-card"
                    onClick={() => onOpenMovie(movie)}
                    onPointerEnter={() => prefetchMovie(movie.id)}
                    onMouseEnter={() => onHoverMovie?.(movie.id)}
                    onFocus={() => onHoverMovie?.(movie.id)}
                    title={`${movie.title} (${movieYear(movie)}) - Watch Trailer`}
                  >
                    <div className="anamorphic-frame-wrap">
                      <img
                        src={backdropUrl(movie.poster_path)}
                        alt={movie.title}
                        loading="lazy"
                        className="anamorphic-frame-img"
                      />
                      <div className="card-overlay-gradient" />
                      <div className="card-quick-badge">
                        <Play size={12} fill="currentColor" />
                      </div>
                    </div>
                    <div className="card-caption">
                      <span className="card-caption-title">{movie.title}</span>
                      <div className="card-caption-meta">
                        <span>{movieYear(movie)}</span>
                        {movie.runtime ? <span>• {movie.runtime}m</span> : null}
                        {directorLabel(movie) && <span>• {directorLabel(movie)}</span>}
                        {movieScore(movie) !== "NR" && (
                          <span className="card-caption-score">★ {movieScore(movie)}</span>
                        )}
                      </div>
                    </div>
                  </button>
                </div>
              );
            }

            return (
              <div
                key={`${title}-${movie.id}-${index}`}
                className="movie-card-container"
              >
                <button
                  type="button"
                  className="cinematic-movie-card"
                  onClick={() => onOpenMovie(movie)}
                  onPointerEnter={() => prefetchMovie(movie.id)}
                  onMouseEnter={() => onHoverMovie?.(movie.id)}
                  onFocus={() => onHoverMovie?.(movie.id)}
                  title={`${movie.title} (${movieYear(movie)}) - Watch Cinema Trailer`}
                >
                  <div className="card-poster-wrap">
                    <img
                      src={posterUrl(movie.poster_path)}
                      alt={movie.title}
                      loading="lazy"
                      className="card-poster"
                    />
                    <div className="card-overlay-gradient" />
                    <div className="card-quick-badge">
                      <Play size={12} fill="currentColor" />
                    </div>
                  </div>
                  <div className="card-caption">
                    <span className="card-caption-title">{movie.title}</span>
                    <div className="card-caption-meta">
                      <span>{movieYear(movie)}</span>
                      {movieScore(movie) !== "NR" && (
                        <span className="card-caption-score">★ {movieScore(movie)}</span>
                      )}
                    </div>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
        {canScrollRight && (
          <button
            type="button"
            className="carousel-arrow carousel-arrow-right"
            onClick={() => handleScroll("right")}
            aria-label={`Scroll ${title} right`}
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>
  );
}

type MoodId = "all" | "action" | "scifi" | "crime" | "animation" | "drama";

interface MoodOption {
  id: MoodId;
  label: string;
  icon: string;
  flagshipTitle: string;
}

const MOOD_FILTERS: MoodOption[] = [
  { id: "all", label: "All Movies", icon: "✦", flagshipTitle: "Dune: Part Two" },
  { id: "action", label: "Action & Thrillers", icon: "⚡", flagshipTitle: "The Dark Knight" },
  { id: "scifi", label: "Sci-Fi & Mind-Benders", icon: "🌌", flagshipTitle: "Interstellar" },
  { id: "crime", label: "Crime & Mystery", icon: "🩸", flagshipTitle: "The Godfather" },
  { id: "animation", label: "Animation & Family", icon: "✨", flagshipTitle: "Spider-Man: Across the Spider-Verse" },
  { id: "drama", label: "Dramas & Epics", icon: "⏳", flagshipTitle: "The Shawshank Redemption" },
];

const HomePage = React.memo(function HomePage({
  movies,
  heroIndex,
  loading,
  error,
  onHeroIndex,
  onOpenMovie,
  recentMovies,
  forYouMovies,
  forYouLoading: _forYouLoading,
  latestMovies: _latestMovies,
  latestLoading: _latestLoading,
  homeMode: _homeMode,
  onToggleMode: _onToggleMode,
  onNavigate: _onNavigate,
  onHoverMovie,
}: {
  movies: Movie[];
  heroIndex: number;
  loading: boolean;
  error: string;
  onHeroIndex: (index: number) => void;
  onOpenMovie: (movie: Movie) => void;
  recentMovies: Movie[];
  forYouMovies: Movie[];
  forYouLoading: boolean;
  latestMovies: Movie[];
  latestLoading: boolean;
  homeMode: "foryou" | "latest" | "trending";
  onToggleMode: (mode: "foryou" | "latest" | "trending") => void;
  onNavigate?: (page: AppPage) => void;
  onHoverMovie?: (movieId?: number) => void;
}) {
  const hero = movies[heroIndex] || movies[0] || null;
  const isLoading = loading && movies.length === 0;

  const [activeMood, setActiveMood] = React.useState<MoodId>("all");

  // Watchlist state for billboard button
  const [isHeroInWatchlist, setIsHeroInWatchlist] = React.useState(false);

  React.useEffect(() => {
    if (!hero?.id) return;
    try {
      const raw = safeGetLocalStorage("nova_watchlist_v2");
      const list = raw ? JSON.parse(raw) : [];
      setIsHeroInWatchlist(Array.isArray(list) && list.some((m: { id?: number }) => m.id === hero.id));
    } catch {
      setIsHeroInWatchlist(false);
    }
  }, [hero?.id]);

  const handleToggleWatchlist = React.useCallback(() => {
    if (!hero?.id) return;
    try {
      const raw = safeGetLocalStorage("nova_watchlist_v2");
      const list = raw ? JSON.parse(raw) : [];
      let updated: Movie[];
      if (list.some((m: { id?: number }) => m.id === hero.id)) {
        updated = list.filter((m: { id?: number }) => m.id !== hero.id);
        setIsHeroInWatchlist(false);
      } else {
        updated = [hero, ...list];
        setIsHeroInWatchlist(true);
      }
      safeSetLocalStorage("nova_watchlist_v2", JSON.stringify(updated));
    } catch {}
  }, [hero]);

  const heroOverview = hero?.overview
    ? hero.overview.length > 200
      ? `${hero.overview.slice(0, 200).replace(/\s+\S*$/, "")}...`
      : hero.overview
    : "";

  // Themed Curated Rails
  const vaultMovies = React.useMemo(() => {
    return [...movies]
      .sort((a, b) => ((b.vote_average ?? 0) * 1000 + (b.popularity ?? 0)) - ((a.vote_average ?? 0) * 1000 + (a.popularity ?? 0)))
      .slice(0, 10);
  }, [movies]);

  const anamorphicMovies = React.useMemo(() => {
    const titles = [
      "Dune: Part Two",
      "Interstellar",
      "The Matrix",
      "Gladiator",
      "Avatar",
      "Jurassic Park",
      "Inception",
      "The Dark Knight",
      "The Lord of the Rings: The Return of the King",
    ];
    const filtered = movies.filter((m) =>
      titles.some((t) => m.title.toLowerCase().includes(t.toLowerCase()))
    );
    return filtered.length >= 4 ? filtered : movies.slice(0, 8);
  }, [movies]);

  const scifiMovies = React.useMemo(() => {
    return movies.filter((m) => {
      const g = typeof m.genres === "string" ? m.genres : Array.isArray(m.genres) ? m.genres.join(" ") : "";
      return /science fiction|sci-fi/i.test(g);
    });
  }, [movies]);

  const crimeMovies = React.useMemo(() => {
    return movies.filter((m) => {
      const g = typeof m.genres === "string" ? m.genres : Array.isArray(m.genres) ? m.genres.join(" ") : "";
      return /crime|thriller|mystery/i.test(g);
    });
  }, [movies]);

  const epicsMovies = React.useMemo(() => {
    return movies.filter((m) => {
      const g = typeof m.genres === "string" ? m.genres : Array.isArray(m.genres) ? m.genres.join(" ") : "";
      return /drama|history|adventure/i.test(g) && !/science fiction|sci-fi|animation/i.test(g);
    });
  }, [movies]);

  const animationMovies = React.useMemo(() => {
    return movies.filter((m) => {
      const g = typeof m.genres === "string" ? m.genres : Array.isArray(m.genres) ? m.genres.join(" ") : "";
      return /animation|fantasy|family/i.test(g);
    });
  }, [movies]);

  const actionMovies = React.useMemo(() => {
    return movies.filter((m) => {
      const g = typeof m.genres === "string" ? m.genres : Array.isArray(m.genres) ? m.genres.join(" ") : "";
      return /action|adventure/i.test(g) && !/animation/i.test(g);
    });
  }, [movies]);

  return (
    <main className="home-shell full-width-layout">
      {hero ? (
        <div className="home-showcase full-width">
          {/* Widescreen Hero Billboard */}
          <section className="billboard-container">
            <div className="billboard-video">
              <TrailerFrame movie={hero} />
            </div>
            <div className="billboard-info">
              <div className="bb-tagline-badge">FEATURED PRESENTATION</div>
              <h2 className="bb-title">{hero.title}</h2>
              <div className="bb-meta">
                {movieScore(hero) !== "NR" && (
                  <span className="bb-rating-pill">★ {movieScore(hero)}</span>
                )}
                <span className="bb-year">{movieYear(hero)}</span>
                {hero.runtime && <span className="bb-runtime">{hero.runtime} min</span>}
                <span className="bb-genres">{compactGenres(hero.genres)}</span>
              </div>
              <p className="bb-overview">{heroOverview}</p>
              <div className="bb-credits">
                {directorLabel(hero) && (
                  <span>
                    Directed by <strong>{directorLabel(hero)}</strong>
                  </span>
                )}
              </div>
              <div className="billboard-actions">
                <button
                  className="bb-play-btn"
                  type="button"
                  onClick={() => onOpenMovie(hero)}
                >
                  <Play size={18} fill="currentColor" />
                  <span>Watch Trailer</span>
                </button>
                <button
                  className={`bb-list-btn ${isHeroInWatchlist ? "in-list" : ""}`}
                  type="button"
                  onClick={handleToggleWatchlist}
                >
                  {isHeroInWatchlist ? <Check size={18} /> : <Plus size={18} />}
                  <span>{isHeroInWatchlist ? "In My List" : "My List"}</span>
                </button>
                <button
                  className="bb-info-btn"
                  type="button"
                  onClick={() => onOpenMovie(hero)}
                >
                  <Info size={18} />
                  <span>More Info</span>
                </button>
              </div>
            </div>
          </section>

          {/* Browse by Mood Quick Filters */}
          <div className="mood-deck-container" role="region" aria-label="Browse by Mood">
            <div className="mood-deck-header">
              <span className="mood-deck-title">Browse by Mood</span>
              {activeMood !== "all" && (
                <button
                  type="button"
                  className="mood-reset-btn"
                  onClick={() => setActiveMood("all")}
                >
                  Clear filter (Show All)
                </button>
              )}
            </div>
            <div className="mood-pills-row" role="tablist" aria-label="Movie moods and categories">
              {MOOD_FILTERS.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="tab"
                  aria-selected={activeMood === m.id}
                  className={`mood-pill ${activeMood === m.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveMood(m.id);
                    const matchIdx = movies.findIndex((movie) =>
                      movie.title.toLowerCase().includes(m.flagshipTitle.toLowerCase())
                    );
                    if (matchIdx !== -1) {
                      onHeroIndex(matchIdx);
                    }
                  }}
                >
                  <span>{m.icon}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Curated Rails */}
          <div className="category-rows">
            {activeMood === "action" && (
              <>
                <CinematicRow
                  title="Featured Action & Thrillers"
                  subtitle={`Showing ${actionMovies.length} high-octane blockbusters and adrenaline-fueled sagas`}
                  movies={actionMovies}
                  variant="vault"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Action Spectacles in Widescreen"
                  subtitle="Monumental action sequences captured for expansive widescreen presentation"
                  movies={actionMovies.filter((m) =>
                    ["The Dark Knight", "The Matrix", "Gladiator", "Avengers: Endgame", "Jurassic Park", "Dune: Part Two"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="anamorphic"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Mind-Bending Action Thrillers"
                  subtitle="High concepts, psychological stakes, and intense pacing"
                  movies={movies.filter((m) =>
                    ["Inception", "The Matrix", "The Dark Knight", "Fight Club"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
              </>
            )}

            {activeMood === "scifi" && (
              <>
                <CinematicRow
                  title="Featured Sci-Fi & Mind-Benders"
                  subtitle={`Showing ${scifiMovies.length} speculative masterworks, space voyages, and future visions`}
                  movies={scifiMovies}
                  variant="vault"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Cosmic Voyages in Widescreen"
                  subtitle="Expansive interstellar and planetary visual masterworks"
                  movies={scifiMovies.filter((m) =>
                    ["Interstellar", "Dune: Part Two", "The Matrix", "Avatar", "Jurassic Park"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="anamorphic"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Time Loops & Simulated Realities"
                  subtitle="Mind-bending realities and alternate timelines"
                  movies={scifiMovies.filter((m) =>
                    ["Inception", "The Matrix", "Back to the Future", "Blade Runner 2049"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
              </>
            )}

            {activeMood === "crime" && (
              <>
                <CinematicRow
                  title="Featured Crime & Mystery"
                  subtitle={`Showing ${crimeMovies.length} legendary mob sagas, noir investigations, and psychological thrillers`}
                  movies={crimeMovies}
                  variant="vault"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Epic Crime Sagas in Widescreen"
                  subtitle="Monumental underworld masterpieces and sprawling crime chronicles"
                  movies={crimeMovies.filter((m) =>
                    ["The Godfather", "The Dark Knight", "GoodFellas", "Pulp Fiction"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="anamorphic"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Dark Psychology & Investigations"
                  subtitle="Twisted puzzles, forensic mind games, and serial investigations"
                  movies={crimeMovies.filter((m) =>
                    ["Seven", "The Silence of the Lambs", "Fight Club", "Parasite"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
              </>
            )}

            {activeMood === "animation" && (
              <>
                <CinematicRow
                  title="Featured Animation & Family"
                  subtitle={`Showing ${animationMovies.length} boundary-pushing visual styles, anime masterworks, and heartfelt stories`}
                  movies={animationMovies}
                  variant="vault"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Stylized Universes in Widescreen"
                  subtitle="Vibrant animation spectacles and fantasy landscapes"
                  movies={animationMovies}
                  variant="anamorphic"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Family & Fantasy Adventures"
                  subtitle="Heartwarming adventures and imaginative family classics"
                  movies={movies.filter((m) =>
                    ["Spirited Away", "Coco", "Barbie", "The Lord of the Rings: The Return of the King", "Jurassic Park"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
              </>
            )}

            {activeMood === "drama" && (
              <>
                <CinematicRow
                  title="Featured Dramas & Epics"
                  subtitle={`Showing ${epicsMovies.length} monumental human stories, emotional depth, and award-winning legacies`}
                  movies={epicsMovies}
                  variant="vault"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Historical & Monumental Sagas in Widescreen"
                  subtitle="Expansive cinematic journeys of courage, redemption, and history"
                  movies={epicsMovies.filter((m) =>
                    ["Gladiator", "The Lord of the Rings: The Return of the King", "Titanic", "Oppenheimer", "Forrest Gump"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="anamorphic"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
                <CinematicRow
                  title="Intimate Human Dramas"
                  subtitle="Unforgettable character studies of perseverance and conviction"
                  movies={epicsMovies.filter((m) =>
                    ["The Shawshank Redemption", "Schindler's List", "12 Angry Men", "Whiplash"].some((t) =>
                      m.title.toLowerCase().includes(t.toLowerCase())
                    )
                  )}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />
              </>
            )}

            {activeMood === "all" && (
              <>
                {/* All-Time Masterpieces */}
                <CinematicRow
                  title="All-Time Masterpieces"
                  subtitle="Highest-rated films celebrated by audiences and critics worldwide"
                  movies={vaultMovies}
                  variant="vault"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />

                {/* Epic Widescreen Spectacles */}
                <CinematicRow
                  title="Epic Widescreen Spectacles"
                  subtitle="Visually expansive masterpieces made for the big screen"
                  movies={anamorphicMovies}
                  variant="anamorphic"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />

                {/* Personalized Recommendations (if available) */}
                {forYouMovies.length > 0 && (
                  <CinematicRow
                    title="Recommended For You"
                    subtitle="Personalized picks based on your watch history and taste"
                    movies={forYouMovies}
                    variant="standard"
                    onOpenMovie={onOpenMovie}
                    onHoverMovie={onHoverMovie}
                  />
                )}

                {/* Mind-Bending Sci-Fi */}
                <CinematicRow
                  title="Mind-Bending Sci-Fi"
                  subtitle="Time loops, space exploration, and futuristic worlds"
                  movies={scifiMovies}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />

                {/* Crime & Thriller Classics */}
                <CinematicRow
                  title="Crime & Thriller Classics"
                  subtitle="Gripping suspense, iconic mob dramas, and investigations"
                  movies={crimeMovies}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />

                {/* Award-Winning Dramas & Epics */}
                <CinematicRow
                  title="Award-Winning Dramas & Epics"
                  subtitle="Unforgettable stories of human courage, redemption, and history"
                  movies={epicsMovies}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />

                {/* Animation & Family Favorites */}
                <CinematicRow
                  title="Animation & Family Favorites"
                  subtitle="Boundary-pushing animated worlds and family favorites"
                  movies={animationMovies}
                  variant="standard"
                  onOpenMovie={onOpenMovie}
                  onHoverMovie={onHoverMovie}
                />

                {/* Recently Viewed / History */}
                {recentMovies.length > 0 && (
                  <CinematicRow
                    title="Continue Watching & Recently Explored"
                    movies={recentMovies}
                    variant="standard"
                    onOpenMovie={onOpenMovie}
                    onHoverMovie={onHoverMovie}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <section className="billboard-container empty">
          <div>
            <Loader2 className={isLoading ? "spin" : undefined} size={28} />
            <h2>{isLoading ? "Loading Showcase" : "Unavailable"}</h2>
            <p>{error || "The recommendation service is warming up."}</p>
          </div>
        </section>
      )}
    </main>
  );
});

// ─── Auth Modal (shared, focus-trapped) ──────────────────────────────────────

function AuthModal({
  onLogin,
  onClose,
}: {
  onLogin: (tok: string, user: string) => void;
  onClose: () => void;
}) {
  const overlayRef = React.useRef<HTMLDivElement>(null);

  // Move focus into the modal on mount; restore on unmount
  React.useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const firstFocusable = overlayRef.current?.querySelector<HTMLElement>(
      'button, input, [href], select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
    return () => { previousFocus?.focus(); };
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key !== "Tab") return;
    const modal = overlayRef.current;
    if (!modal) return;
    const focusable = Array.from(
      modal.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <div
      ref={overlayRef}
      className="auth-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Sign in to your account"
      tabIndex={-1}
      onKeyDown={handleKeyDown}
    >
      <AuthPage onLogin={(tok, user) => { onLogin(tok, user); }} onClose={onClose} />
    </div>
  );
}

function App() {
  const [token, setToken] = React.useState<string | null>(() => safeGetLocalStorage("nova_jwt_token"));
  const [username, setUsername] = React.useState<string | null>(() => safeGetLocalStorage("nova_username"));
  const [page, setPage] = React.useState<AppPage>(() => typeof window !== "undefined" ? getPageFromPath(window.location.pathname) : "home");
  const [showAuthModal, setShowAuthModal] = React.useState(false);
  const [titles, setTitles] = React.useState<MovieTitle[]>([]);
  const [titleQuery, setTitleQuery] = React.useState("");
  const [mode, setMode] = React.useState<SearchMode>("title");
  const [selectedMovie, setSelectedMovie] = React.useState<Movie | null>(null);
  const [results, setResults] = React.useState<Movie[]>([]);
  const [resultsKind, setResultsKind] = React.useState<ResultsKind>("idle");
  const [catalogState, setCatalogState] = React.useState<CatalogState>("booting");
  const [backend, setBackend] = React.useState(currentBackend());
  const [notice, setNotice] = React.useState("Connecting to recommendation API");
  const [retryCount, setRetryCount] = React.useState(0);
  const [isSearching, setIsSearching] = React.useState(false);
  const [isSelecting, setIsSelecting] = React.useState(false);
  const [loadingRecs, setLoadingRecs] = React.useState(false);
  const [_lastUpdated, setLastUpdated] = React.useState("");
  const [platform, setPlatform] = React.useState<PlatformStatus | null>(null);
  const [readinessReport, setReadinessReport] = React.useState<PlatformReadiness | null>(null);
  const [artifactReport, setArtifactReport] = React.useState<ArtifactHealth | null>(null);
  const [qualityReport, setQualityReport] = React.useState<SemanticBenchmark | null>(null);
  const [signalsLoading, setSignalsLoading] = React.useState(false);
  const [recentMovies, setRecentMovies] = React.useState<Movie[]>(() => loadRecentMovies());
  const [feedbackByMovieId, setFeedbackByMovieId] = React.useState<Record<number, FeedbackValue>>({});
  const [feedbackNotice, setFeedbackNotice] = React.useState("");
  const [lastRecommendationRequestId, setLastRecommendationRequestId] = React.useState<string | null>(null);
  const [recommendationSource, setRecommendationSource] = React.useState<Movie | null>(null);
  const [dialogMovie, setDialogMovie] = React.useState<Movie | null>(null);
  const [titleSelectOpen, setTitleSelectOpen] = React.useState(false);
  const [homeMovies, setHomeMovies] = React.useState<Movie[]>(() => loadCachedShowcaseMovies());
  const [homeHeroIndex, setHomeHeroIndex] = React.useState(0);
  const [homeLoading, setHomeLoading] = React.useState(false);
  const [homeError, setHomeError] = React.useState("");
  const [forYouMovies, setForYouMovies] = React.useState<Movie[]>([]);
  const [forYouLoading, setForYouLoading] = React.useState(false);
  const [latestMovies, setLatestMovies] = React.useState<Movie[]>(() => loadCachedLatestMovies());
  const [latestLoading, setLatestLoading] = React.useState(false);
  const [homeMode, setHomeMode] = React.useState<"foryou" | "latest" | "trending">(() => loadRecentMovies().length > 0 ? "foryou" : "trending");
  const [sessionId] = React.useState(() => getSessionId());
  const [isMobileViewport, setIsMobileViewport] = React.useState(() => typeof window !== "undefined" ? window.innerWidth <= 768 : false);
  const [isMobileSimulated, setIsMobileSimulated] = React.useState(false);
  const [showMoreDrawer, setShowMoreDrawer] = React.useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [deferredPrompt, setDeferredPrompt] = React.useState<any>(null);

  React.useEffect(() => {
    function handleInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e);
    }
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
  }, []);

  React.useEffect(() => {
    function handleResize() {
      setIsMobileViewport(window.innerWidth <= 768);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobileMode = isMobileViewport || isMobileSimulated;
  const titleSelectRef = React.useRef<HTMLDivElement>(null);
  const bootstrapped = React.useRef(false);
  const loadedPlatform = React.useRef(false);
  const loadedHomeShowcase = React.useRef(false);
  const _loadedForYou = React.useRef(false);
  const userStarted = React.useRef(false);
  const activeQuery = titleQuery;
  const hasTitleQuery = titleQuery.trim().length > 0;
  const selectedTitleLabel = selectedMovie ? selectTitleLabel(selectedMovie) : "";
  const isSelectedTitleQuery = Boolean(selectedMovie && titleQuery === selectedTitleLabel);
  const isEditingTitle = Boolean(selectedMovie && hasTitleQuery && !isSelectedTitleQuery);
  const showTitleSuggestions = titleSelectOpen && hasTitleQuery && !isSelectedTitleQuery;
  const showNotice = catalogState !== "ready";

  const filteredTitles = React.useMemo(() => {
    const normalized = titleQuery.trim().toLowerCase();
    if (!normalized) return titles.slice(0, 34);
    const scoreTitle = (title: string) => {
      const value = title.toLowerCase();
      const cleanValue = value.replace(/^the\s+/, "");
      const index = Math.min(
        value.includes(normalized) ? value.indexOf(normalized) : Number.POSITIVE_INFINITY,
        cleanValue.includes(normalized) ? cleanValue.indexOf(normalized) : Number.POSITIVE_INFINITY,
      );
      const prefix = value.startsWith(normalized) || cleanValue.startsWith(normalized) ? 0 : 1;
      const exact = value === normalized || cleanValue === normalized ? 0 : 1;
      return { exact, prefix, index, length: value.length, value };
    };

    return titles
      .filter((item) => item.title.toLowerCase().replace(/^the\s+/, "").includes(normalized) || item.title.toLowerCase().includes(normalized))
      .sort((a, b) => {
        const left = scoreTitle(a.title);
        const right = scoreTitle(b.title);
        return (
          left.exact - right.exact ||
          left.prefix - right.prefix ||
          left.index - right.index ||
          left.length - right.length ||
          left.value.localeCompare(right.value)
        );
      })
      .slice(0, 34);
  }, [titles, titleQuery]);

  const resultHeading =
    resultsKind === "recommendations"
      ? `Recommendations similar to ${(recommendationSource || selectedMovie)?.title || "this title"}`
      : "Search matches";

  const prefetchSetRef = React.useRef<Set<number>>(new Set());
  const _prefetchMovieIntent = React.useCallback((movieId?: number) => {
    if (!movieId || prefetchSetRef.current.has(movieId)) return;
    prefetchSetRef.current.add(movieId);
    void getRecommendations(movieId, 8, 5000).catch(() => {});
  }, []);

  function rememberMovie(movie: Movie) {
    const next = dedupeMovies([movie, ...recentMovies]).slice(0, 6);
    setRecentMovies(next);
    saveRecentMovies(next);
  }

  function emitBehaviorEvent(payload: EventPayload) {
    const eventPayload: EventPayload = {
      ...payload,
      session_id: payload.session_id || sessionId,
      user_id: payload.user_id || username || undefined,
      metadata: {
        client: "react",
        surface: "web",
        auth_state: username ? "authenticated" : "anonymous",
        username: username || undefined,
        ...(payload.metadata || {}),
      },
    };
    if (eventPayload.movie_id !== null && eventPayload.movie_id !== undefined && !eventPayload.content_id) {
      eventPayload.content_id = String(eventPayload.movie_id);
    }

    void recordEvent(eventPayload).catch((error) => {
      console.warn("Behavior event was not recorded", error);
    });
  }

  async function loadHomeShowcase() {
    setHomeLoading(true);
    setHomeError("");

    // Phase 1: Instant showcase from in-memory catalog (no TMDB, no ML — sub-200ms)
    try {
      const showcaseResponse = await getShowcaseMovies(30);
      if (showcaseResponse.data && showcaseResponse.data.length > 0) {
        const movies = dedupeMovies(showcaseResponse.data).slice(0, 30);
        setBackend(showcaseResponse.baseUrl);
        setHomeMovies(movies);
        saveCachedShowcaseMovies(movies);
        setHomeHeroIndex(0);
        setCatalogState("ready");
        setHomeLoading(false);

        // Phase 2: Lazy-warmup ML recommendations in background for For You rail
        const seeds = [155, 27205, 157336, 680, 238];
        const seedId = seeds[Math.floor(Math.random() * seeds.length)];
        getRecommendations(seedId, 10, 8000)
          .then((recResponse) => {
            const recMovies = dedupeMovies(recResponse.data.recommendations || []).slice(0, 10);
            if (recMovies.length > 0) {
              setForYouMovies(recMovies);
            }
          })
          .catch(() => { /* Showcase already visible, ML upgrade is optional */ });
        return;
      }
    } catch (e) {
      console.warn("[SHOWCASE] Fast showcase unavailable, falling back:", e);
    }

    // Phase 1b fallback: search query (still fast, just reads DB)
    try {
      const searchResponse = await searchMovies("Batman");
      if (searchResponse.data && searchResponse.data.length > 0) {
        const movies = dedupeMovies(searchResponse.data).slice(0, 30);
        setBackend(searchResponse.baseUrl);
        setHomeMovies(movies);
        saveCachedShowcaseMovies(movies);
        setHomeHeroIndex(0);
        setCatalogState("ready");
      } else if (homeMovies.length === 0) {
        setHomeError("No movies found in catalog.");
      }
    } catch (error) {
      if (homeMovies.length === 0) {
        setHomeError(error instanceof Error ? error.message : "Movies unavailable during warmup.");
      }
    } finally {
      setHomeLoading(false);
    }
  }

  async function loadForYouShowcase(userId?: string) {
    setForYouLoading(true);
    try {
      if (userId && userId !== "Guest") {
        try {
          const response = await getUserRecommendations(userId, 8);
          const movies = dedupeMovies(response.data || []).slice(0, 8);
          if (movies.length > 0) {
            setForYouMovies(movies);
            setBackend(response.baseUrl);
            setHomeHeroIndex(0);
            return;
          }
        } catch {
          // If user recs fails (e.g. 401 unauthenticated), proceed to recent movies fallback
        }
      }
      const recent = loadRecentMovies();
      if (recent.length > 0 && recent[0].id) {
        const response = await getRecommendations(recent[0].id, 8, 4000);
        const movies = dedupeMovies(response.data.recommendations || []).slice(0, 8);
        if (movies.length > 0) {
          setForYouMovies(movies);
          setHomeHeroIndex(0);
          return;
        }
      }
      // If neither personalized source was available, fall back to trending
      setHomeMode("trending");
    } catch {
      // Fall back to trending silently
      setHomeMode("trending");
    } finally {
      setForYouLoading(false);
    }
  }

  async function loadLatestShowcase() {
    setLatestLoading(true);
    try {
      // Fetch real latest/trending movies from TMDB via backend
      const response = await apiGet<Movie[]>("/movies/latest", { limit: 8 }, 6000);
      const movies = response.data || [];
      if (movies.length > 0) {
        const deduped = dedupeMovies(movies).slice(0, 8);
        setLatestMovies(deduped);
        saveCachedLatestMovies(deduped);
        setHomeHeroIndex(0);
      }
      setCatalogState("ready");
    } catch { /* silent fallback */ }
    finally { setLatestLoading(false); }
  }

  function selectMovie(movie: Movie, source: SelectionSource, track = true) {
    setSelectedMovie(movie);
    rememberMovie(movie);
    if (!track) return;
    emitBehaviorEvent({
      event_type: "view",
      movie_id: movie.id,
      metadata: {
        source,
        title: movie.title,
        results_kind: resultsKind,
      },
    });
  }

  function selectResultMovie(movie: Movie) {
    if (resultsKind === "recommendations") {
      const sourceMovie = recommendationSource || selectedMovie;
      emitBehaviorEvent({
        event_type: "click",
        movie_id: movie.id,
        source_content_id: sourceMovie ? String(sourceMovie.id) : undefined,
        request_id: lastRecommendationRequestId,
        metadata: {
          title: movie.title,
          source_title: sourceMovie?.title,
          retrieval_stage: movie.retrieval_stage,
          similarity_score: movie.similarity_score,
        },
      });
      rememberMovie(movie);
      setDialogMovie(movie);
      return;
    }
    setDialogMovie(movie);
    selectMovie(movie, "search_result");
  }

  function recordFeedback(movie: Movie, value: FeedbackValue) {
    const rating = value === "positive" ? 5 : 1;
    const sourceMovie = resultsKind === "recommendations" ? recommendationSource || selectedMovie : selectedMovie;
    setFeedbackByMovieId((current) => ({ ...current, [movie.id]: value }));
    setFeedbackNotice(value === "positive" ? "Preference saved" : "Negative signal saved");
    emitBehaviorEvent({
      event_type: "rating",
      movie_id: movie.id,
      source_content_id: sourceMovie && sourceMovie.id !== movie.id ? String(sourceMovie.id) : undefined,
      rating,
      request_id: lastRecommendationRequestId,
      metadata: {
        title: movie.title,
        source_title: sourceMovie?.title,
        sentiment: value,
        results_kind: resultsKind,
        retrieval_stage: movie.retrieval_stage,
        similarity_score: movie.similarity_score,
      },
    });
  }

  function recordRating(movie: Movie, stars: number) {
    const sourceMovie = resultsKind === "recommendations" ? recommendationSource || selectedMovie : selectedMovie;
    emitBehaviorEvent({
      event_type: "rating",
      movie_id: movie.id,
      source_content_id: sourceMovie && sourceMovie.id !== movie.id ? String(sourceMovie.id) : undefined,
      rating: stars,
      request_id: lastRecommendationRequestId,
      metadata: {
        title: movie.title,
        source_title: sourceMovie?.title,
        sentiment: stars >= 4 ? "positive" : stars <= 2 ? "negative" : "neutral",
        stars,
        results_kind: resultsKind,
        retrieval_stage: movie.retrieval_stage,
        similarity_score: movie.similarity_score,
      },
    });
  }

  async function bootstrap(silent = false) {
    setCatalogState(silent ? "warming" : "booting");
    setNotice(silent ? "Checking the service again" : "Connecting to recommendation API");
    try {
      const ping = await pingApi();
      setBackend(ping.baseUrl);
      setNotice("Service online. Loading catalog.");

      const result = await loadTitles(TITLE_CATALOG_LIMIT);
      setTitles(result.data);
      setBackend(result.baseUrl);
      setCatalogState("ready");
      setRetryCount(0);
      setLastUpdated(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setNotice(`${result.data.length.toLocaleString()} searchable titles loaded`);
    } catch (error) {
      setCatalogState("warming");
      setRetryCount((count) => count + 1);
      setNotice(error instanceof Error ? `Service warming. ${error.message}` : "Service warming.");
    }
  }

  function loadOperationalSignals() {
    setSignalsLoading(true);

    const settle = <T,>(request: Promise<{ data: T; baseUrl: string }>, onValue: (data: T, baseUrl: string) => void) =>
      request
        .then((response) => {
          setBackend(response.baseUrl);
          onValue(response.data, response.baseUrl);
          return true;
        })
        .catch((error) => {
          console.warn("Operational signal unavailable", error);
          return false;
        });

    const requests = [
      settle(platformStatus(), (data) => setPlatform(data)),
      settle(platformReadiness(true, 10), (data) => setReadinessReport(data)),
      settle(artifactHealth(), (data) => setArtifactReport(data)),
      settle(semanticBenchmark(10), (data) => setQualityReport(data)),
    ];

    void Promise.all(requests).then((results) => {
      setSignalsLoading(false);
      if (results.every((success) => !success)) {
        loadedPlatform.current = false;
      }
    });
  }

  React.useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    void bootstrap();
  }, []);

  React.useEffect(() => {
    if (loadedHomeShowcase.current) return;
    loadedHomeShowcase.current = true;
    void loadHomeShowcase();
  }, []);

  React.useEffect(() => {
    void loadForYouShowcase(username || "Guest");
  }, [username]);

  const loadedLatest = React.useRef(false);
  React.useEffect(() => {
    if (loadedLatest.current) return;
    loadedLatest.current = true;
    void loadLatestShowcase();
  }, []);

  React.useEffect(() => {
    if (catalogState !== "warming") return;
    const delay = Math.min(30000, 7000 + retryCount * 4000);
    const retry = window.setTimeout(() => void bootstrap(true), delay);
    return () => window.clearTimeout(retry);
  }, [catalogState, retryCount]);

  React.useEffect(() => {
    if (catalogState === "ready") {
      if (homeMovies.length === 0 && !homeLoading) {
        void loadHomeShowcase();
      }
      if (latestMovies.length === 0 && !latestLoading) {
        void loadLatestShowcase();
      }
    }
  }, [catalogState, homeMovies.length, homeLoading, latestMovies.length, latestLoading]);

  React.useEffect(() => {
    if (catalogState !== "ready" || loadedPlatform.current) return;
    loadedPlatform.current = true;
    const timer = window.setTimeout(() => {
      loadOperationalSignals();
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [catalogState]);

  React.useEffect(() => {
    const query = titleQuery.trim();
    if (!query) {
      setResults([]);
      setResultsKind("idle");
      return;
    }
    if (selectedMovie && query === selectTitleLabel(selectedMovie)) {
      return;
    }

    const delay = mode === "semantic" ? 1000 : 300;
    const timer = window.setTimeout(() => {
      void runSearch(mode);
    }, delay);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [titleQuery, mode]);

  async function chooseTitle(
    item: MovieTitle,
    options: { track?: boolean; autoRecommend?: boolean } = {},
  ) {
    setIsSelecting(true);
    setTitleQuery(item.title);
    setResults([]);
    setResultsKind("idle");
    setLastRecommendationRequestId(null);
    setRecommendationSource(null);
    setFeedbackByMovieId({});
    setFeedbackNotice("");
    setNotice("Opening title");
    try {
      const result = await getMovie(item.id);
      setBackend(result.baseUrl);
      setTitleQuery(selectTitleLabel(result.data));
      setTitleSelectOpen(false);
      selectMovie(result.data, "title_search", options.track ?? true);
      setCatalogState("ready");
      setNotice("Title ready");
      if (options.autoRecommend) {
        void recommend(result.data);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Title unavailable");
    } finally {
      setIsSelecting(false);
    }
  }

  async function runSearch(searchMode: SearchMode = mode, queryOverride?: string) {
    const query = (queryOverride ?? titleQuery).trim();
    if (!query) return;

    if (searchMode === "title" && !queryOverride && isSelectedTitleQuery && selectedMovie) {
      await recommend(selectedMovie);
      return;
    }
    setIsSearching(true);
    setNotice(searchMode === "semantic" ? "Searching by intent" : "Searching catalog");
    setResults([]);
    setResultsKind("search");
    setLastRecommendationRequestId(null);
    setRecommendationSource(null);
    setFeedbackByMovieId({});
    setFeedbackNotice("");
    emitBehaviorEvent({
      event_type: "search",
      query_text: query,
      metadata: {
        mode: searchMode,
      },
    });
    try {
      const response = searchMode === "semantic" ? await aiSearch(query) : await searchMovies(query);
      const movies = dedupeMovies(response.data);
      setBackend(response.baseUrl);
      setResults(movies);
      if (movies[0]) {
        selectMovie(movies[0], searchMode === "semantic" ? "semantic_search" : "title_search");
      } else {
        setSelectedMovie(null);
      }
      setCatalogState("ready");
      setNotice(`${movies.length} matches`);
    } catch (error) {
      setCatalogState("error");
      setNotice(error instanceof Error ? error.message : "Search unavailable");
    } finally {
      setIsSearching(false);
    }
  }

  async function recommend(movie = selectedMovie) {
    if (!movie) return;
    setLoadingRecs(true);
    setNotice("Ranking candidates");
    try {
      const response = await getRecommendations(movie.id, 16);
      const recommendations = dedupeMovies(response.data.recommendations);
      setBackend(response.baseUrl);
      setRecommendationSource(response.data.query_movie);
      selectMovie(response.data.query_movie, "search_result", false);
      setResults(recommendations);
      setResultsKind("recommendations");
      setFeedbackByMovieId({});
      setFeedbackNotice("");
      setLastRecommendationRequestId(response.data.request_id || null);
      setCatalogState("ready");
      setNotice(`${recommendations.length} recommendations ranked`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Recommendations unavailable");
    } finally {
      setLoadingRecs(false);
    }
  }

  const navigateTo = React.useCallback((targetPage: AppPage, options?: { mode?: SearchMode; replace?: boolean }) => {
    setPage(targetPage);
    setDialogMovie(null);
    setTitleSelectOpen(false);
    if (targetPage === "search" && options?.mode) {
      setMode(options.mode);
    }
    const path = pageToPath(targetPage, options?.mode || (targetPage === "search" ? mode : undefined));
    if (typeof window !== "undefined" && window.history) {
      if (options?.replace) {
        window.history.replaceState({ page: targetPage, mode: options?.mode }, "", path);
      } else {
        window.history.pushState({ page: targetPage, mode: options?.mode }, "", path);
      }
    }
  }, [mode]);

  function openHome() {
    navigateTo("home");
  }

  function openSearch(searchMode?: "title" | "semantic") {
    navigateTo("search", { mode: searchMode });
    // Auto-expand semantic section and focus the right input after render
    if (searchMode === "semantic") {
      setTimeout(() => {
        const details = document.querySelector(".semantic-expander") as HTMLDetailsElement | null;
        if (details) details.open = true;
        const input = document.getElementById("semantic-search") as HTMLInputElement | null;
        if (input) input.focus();
      }, 100);
    } else if (searchMode === "title") {
      setTimeout(() => {
        const input = document.getElementById("title-search") as HTMLInputElement | null;
        if (input) input.focus();
      }, 100);
    }
  }

  // Browser back/forward button support
  React.useEffect(() => {
    function handlePopState(event: PopStateEvent) {
      const state = event.state;
      if (state?.page) {
        setPage(state.page);
        if (state.mode) setMode(state.mode);
        setDialogMovie(null);
      } else if (typeof window !== "undefined") {
        const pageFromPath = getPageFromPath(window.location.pathname);
        setPage(pageFromPath);
        setDialogMovie(null);
      }
    }
    window.addEventListener("popstate", handlePopState);
    if (typeof window !== "undefined" && window.history) {
      const initialPath = pageToPath(page, mode);
      window.history.replaceState({ page, mode }, "", initialPath);
    }
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const catalogValue = platform?.movie_count || titles.length;
  const rankerValue = platform?.ranker?.available ? "Learned" : "Hybrid";
  const innerPages: AppPage[] = [
    "vector-space",
    "data-platform",
    "dashboard",
    "knowledge-graph",
    "evaluation",
    "profile",
    "admin",
  ];
  const isAppPage = ["home", "search", ...innerPages].includes(page);

  // ── Full-screen marketing pages (no app shell) ───────────────────────────
  if (page === "landing") {
    return (
      <React.Suspense fallback={<SuspenseFallback />}>
        <LandingPage onNavigate={(p) => navigateTo(p as AppPage)} />
      </React.Suspense>
    );
  }
  if (page === "signup") {
    return (
      <React.Suspense fallback={<SuspenseFallback />}>
        <SignupPage
          onNavigate={(p) => navigateTo(p as AppPage)}
          onLoginSuccess={(tok, user) => { setToken(tok); setUsername(user); }}
        />
      </React.Suspense>
    );
  }
  if (page === "pricing") {
    return (
      <React.Suspense fallback={<SuspenseFallback />}>
        <PricingPage onNavigate={(p) => navigateTo(p as AppPage)} />
      </React.Suspense>
    );
  }
  if (page === "getting-started") {
    return (
      <React.Suspense fallback={<SuspenseFallback />}>
        <GettingStartedPage onNavigate={(p) => navigateTo(p as AppPage)} />
      </React.Suspense>
    );
  }
  if (page === "status") {
    return (
      <React.Suspense fallback={<SuspenseFallback />}>
        <StatusPage />
      </React.Suspense>
    );
  }

  // ── App Shell Pages (Browse, Search, Dashboard, KG, Eval, Profile, Admin) ─
  if (isAppPage && isMobileMode) {
    const mobileContent = (
      <div className="iphone-screen">
        <div className="mobile-screen-orb" />

        {/* Simplified Sticky Header */}
        <header className="topbar" style={{ position: "sticky", top: 0, width: "100%", zIndex: 100 }}>
          <button className="brand-logo" type="button" onClick={openHome} style={{ fontSize: "1.3rem" }}>NOVA</button>
          <div className="topbar-right" style={{ gap: "12px" }}>
            <StatusBadge state={catalogState} backend={backend} />
            {username ? (
              <div className="user-profile-menu" style={{ padding: "4px 12px" }}>
                <button className="profile-btn" type="button" onClick={() => navigateTo("profile")}>
                  <strong>{username}</strong>
                </button>
              </div>
            ) : (
              <button className="signin-nav-btn" type="button" onClick={() => setShowAuthModal(true)}>
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="mobile-shell-content">
          {page === "home" && (
            <HomePage
              movies={homeMovies}
              heroIndex={homeHeroIndex}
              loading={homeLoading}
              error={homeError}
              onHeroIndex={setHomeHeroIndex}
              onOpenMovie={setDialogMovie}
              recentMovies={recentMovies}
              forYouMovies={forYouMovies}
              forYouLoading={forYouLoading}
              latestMovies={latestMovies}
              latestLoading={latestLoading}
              homeMode={homeMode}
              onToggleMode={setHomeMode}
              onHoverMovie={_prefetchMovieIntent}
            />
          )}

          {page === "search" && (
            <main className="search-page-layout">
              {/* Metrics strip in 2x2 grid */}
              <section className="metrics-strip" aria-label="Platform snapshot" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px", marginBottom: "16px" }}>
                <MetricTile icon={<Database size={14} />} label="Catalog" value={catalogValue ? catalogValue.toLocaleString() : "Loading"} />
                <MetricTile icon={<Server size={14} />} label="Readiness" value={readinessLabel(readinessReport)} />
                <MetricTile icon={<Gauge size={14} />} label="Quality" value={qualityLabel(qualityReport)} />
                <MetricTile icon={<Activity size={14} />} label="Artifacts" value={healthLabel(artifactReport)} />
              </section>

              <section className="workspace" style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div className="control-panel" style={{ padding: "16px", borderRadius: "16px" }}>
                  <div className="title-select" ref={titleSelectRef}>
                    <div className="search-box title-select-box" style={{ padding: "4px 8px" }}>
                      {mode === "semantic" ? <Sparkles size={16} className="mode-icon-semantic" /> : <Search size={16} />}
                      <input
                        id="title-search"
                        value={titleQuery}
                        onChange={(event) => {
                          userStarted.current = true;
                          setMode(mode);
                          setTitleQuery(event.target.value);
                          setTitleSelectOpen(true);
                          if (selectedMovie && event.target.value !== selectedTitleLabel) {
                            setSelectedMovie(null);
                            setResults([]);
                            setResultsKind("idle");
                            setRecommendationSource(null);
                            setDialogMovie(null);
                            setLastRecommendationRequestId(null);
                          }
                        }}
                        onFocus={() => setTitleSelectOpen(true)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setTitleSelectOpen(false);
                            return;
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            setTitleSelectOpen(false);
                            void runSearch(mode);
                          }
                        }}
                        placeholder={mode === "title" ? "Movie title..." : "Plot, mood..."}
                        style={{ fontSize: "0.82rem" }}
                      />
                      <button
                        className={`mode-toggle-btn ${mode === "semantic" ? "semantic-active" : ""}`}
                        type="button"
                        onClick={() => setMode(mode === "title" ? "semantic" : "title")}
                        style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      >
                        {mode === "semantic" ? <Sparkles size={12} /> : <Search size={12} />}
                      </button>
                    </div>

                    {showTitleSuggestions && mode === "title" && (
                      <div className="title-list" style={{ maxHeight: "200px" }}>
                        {filteredTitles.slice(0, 8).map((item) => (
                          <button
                            type="button"
                            key={`${item.id}-${item.title}`}
                            onClick={() => void chooseTitle(item, { autoRecommend: true })}
                            style={{ fontSize: "0.82rem", padding: "8px 12px" }}
                          >
                            {item.title}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="result-panel">
                  {selectedMovie && !isEditingTitle ? (
                    <MovieSpotlight
                      movie={selectedMovie}
                      loading={loadingRecs}
                      onRecommend={() => void recommend()}
                      userId={username}
                      sessionId={sessionId}
                    />
                  ) : null}

                  {isSearching || loadingRecs ? (
                    <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                      <Loader2 className="spin" size={28} style={{ color: "var(--accent)" }} />
                    </div>
                  ) : results.length > 0 ? (
                    <section className="results-section">
                      <div className="section-title" style={{ fontSize: "0.95rem", margin: "12px 0 6px" }}>
                        <h2>{resultsKind === "recommendations" ? "Similar Movies" : "Search Results"}</h2>
                      </div>
                      <div className="poster-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "10px" }}>
                        {results.map((movie, index) => (
                          <RecommendationCard
                            key={`${movie.id}-${movie.title}`}
                            movie={movie}
                            rank={index + 1}
                            onSelect={selectResultMovie}
                            feedback={feedbackByMovieId[movie.id]}
                            onFeedback={recordFeedback}
                          />
                        ))}
                      </div>
                    </section>
                  ) : (
                    /* Show trending keywords and popular searches on mobile search if empty */
                    !selectedMovie && (
                      <div className="search-suggestions" style={{ marginTop: "16px" }}>
                        <div style={{ marginBottom: "20px" }}>
                          <span style={{ fontSize: "0.72rem", color: "var(--accent)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Intent filter</span>
                          <h3 style={{ fontSize: "0.95rem", color: "#fff", fontWeight: 700, margin: "2px 0 10px", fontFamily: "var(--font-headline)" }}>Trending Searches</h3>
                          <div className="search-tags" style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                            {["Batman", "Godfather", "Inception", "Sci-Fi", "Action", "Thriller"].map((tag) => (
                              <button
                                key={tag}
                                className="suggestion-tag-btn"
                                type="button"
                                onClick={() => {
                                  setTitleQuery(tag);
                                  void runSearch("title", tag);
                                }}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        </div>

                        {latestMovies.length > 0 && (
                          <div>
                            <div className="section-title" style={{ fontSize: "0.95rem", margin: "16px 0 10px" }}>
                              <h2>Popular Searches</h2>
                            </div>
                            <div className="poster-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px" }}>
                              {latestMovies.slice(0, 4).map((movie) => (
                                <button
                                  type="button"
                                  key={`mobile-popular-${movie.id}`}
                                  className="popular-search-card"
                                  onPointerEnter={() => prefetchMovie(movie.id)}
                                  onClick={() => {
                                    setTitleQuery(selectTitleLabel(movie));
                                    selectMovie(movie, "title_search");
                                    void recommend(movie);
                                  }}
                                  style={{
                                    background: "rgba(255,255,255,0.02)",
                                    border: "1px solid rgba(255,255,255,0.05)",
                                    borderRadius: "16px",
                                    padding: "10px",
                                    cursor: "pointer",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "8px",
                                    textAlign: "left",
                                    transition: "all 0.2s ease"
                                  }}
                                >
                                  <img
                                    src={posterUrl(movie.poster_path)}
                                    alt={movie.title}
                                    style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", borderRadius: "10px" }}
                                  />
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", overflow: "hidden" }}>
                                    <strong style={{ fontSize: "0.8rem", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{movie.title}</strong>
                                    <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{movieYear(movie)}</span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </section>
            </main>
          )}

          <React.Suspense fallback={<SuspenseFallback />}>
            {page === "vector-space" && <main className="app-shell inner-shell"><ErrorBoundary><VectorSpace onSelectMovie={(movie) => setDialogMovie(movie)} titles={titles} /></ErrorBoundary></main>}
            {page === "data-platform" && <main className="app-shell inner-shell"><ErrorBoundary><DataEngineeringPage /></ErrorBoundary></main>}
            {page === "dashboard" && <main className="app-shell inner-shell"><ErrorBoundary><Dashboard /></ErrorBoundary></main>}
            {page === "knowledge-graph" && <main className="app-shell inner-shell"><ErrorBoundary><KnowledgeGraphPage titles={titles} /></ErrorBoundary></main>}
            {page === "evaluation" && <main className="app-shell inner-shell"><ErrorBoundary><EvaluationPage /></ErrorBoundary></main>}
            {page === "profile" && (
              <main className="app-shell inner-shell">
                <ErrorBoundary>
                  <UserProfilePage
                    token={token}
                    username={username}
                    onRequestLogin={() => setShowAuthModal(true)}
                    onSelectMovie={(movie) => { setDialogMovie(movie); }}
                    onNavigate={(p) => navigateTo(p as AppPage)}
                  />
                </ErrorBoundary>
              </main>
            )}
            {page === "admin" && <main className="app-shell inner-shell"><ErrorBoundary><AdminPanel token={token} /></ErrorBoundary></main>}
          </React.Suspense>
        </div>

        {/* Bottom Navigation Bar */}
        <nav className="mobile-nav-bar" aria-label="Mobile navigation">
          <button
            className={`mobile-nav-tab ${page === "home" ? "active" : ""}`}
            type="button"
            onClick={() => { openHome(); setShowMoreDrawer(false); }}
          >
            <Film size={20} />
            <span>Explore</span>
          </button>
          <button
            className={`mobile-nav-tab ${page === "search" ? "active" : ""}`}
            type="button"
            onClick={() => { openSearch(); setShowMoreDrawer(false); }}
          >
            <Search size={20} />
            <span>Search</span>
          </button>
          <button
            className={`mobile-nav-tab ${page === "data-platform" ? "active" : ""}`}
            type="button"
            onClick={() => { navigateTo("data-platform"); setShowMoreDrawer(false); }}
          >
            <Database size={20} />
            <span>Platform</span>
          </button>
          <button
            className={`mobile-nav-tab ${page === "knowledge-graph" ? "active" : ""}`}
            type="button"
            onClick={() => { navigateTo("knowledge-graph"); setShowMoreDrawer(false); }}
          >
            <Network size={20} />
            <span>Graph</span>
          </button>
          <button
            className={`mobile-nav-tab ${["profile", "dashboard", "admin", "evaluation", "vector-space"].includes(page) ? "active" : ""}`}
            type="button"
            onClick={() => { navigateTo("profile"); setShowMoreDrawer(false); }}
          >
            <User size={20} />
            <span>Watchlist</span>
          </button>
        </nav>

        {/* Slide-up bottom sheet drawer for "More" options */}
        {showMoreDrawer && (
          <div className="mobile-bottom-sheet-overlay" onClick={() => setShowMoreDrawer(false)} role="presentation">
            {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
            <div className="mobile-bottom-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="More navigation options">
              <div className="sheet-handle" />
              <h3 className="sheet-title">More Options</h3>
              <div className="sheet-links">
                {username && (
                  <button
                    className="sheet-link-btn"
                    type="button"
                    onClick={() => { setPage("profile"); setShowMoreDrawer(false); }}
                  >
                    <User size={18} />
                    <span>My Profile</span>
                  </button>
                )}
                <button
                  className="sheet-link-btn"
                  type="button"
                  onClick={() => { setPage("dashboard"); setShowMoreDrawer(false); }}
                >
                  <Activity size={18} />
                  <span>System Dashboard</span>
                </button>
                {username === "admin" && (
                  <button
                    className="sheet-link-btn"
                    type="button"
                    onClick={() => { setPage("admin"); setShowMoreDrawer(false); }}
                  >
                    <Server size={18} />
                    <span>Admin Panel</span>
                  </button>
                )}
                <button
                  className="sheet-link-btn"
                  type="button"
                  onClick={() => { setPage("status"); setShowMoreDrawer(false); }}
                >
                  <Database size={18} />
                  <span>System Status</span>
                </button>
                <button
                  className="sheet-link-btn"
                  type="button"
                  onClick={async () => {
                    if (deferredPrompt) {
                      deferredPrompt.prompt();
                      const { outcome } = await deferredPrompt.userChoice;
                      if (outcome === "accepted") {
                        setDeferredPrompt(null);
                      }
                    } else {
                      window.alert("To install this app on your phone:\n\n1. Tap the Share button in your mobile browser.\n2. Select 'Add to Home Screen'.\n3. Launch Nova directly from your home screen!");
                    }
                    setShowMoreDrawer(false);
                  }}
                  style={{ background: "rgba(16, 185, 129, 0.08)", borderColor: "rgba(16, 185, 129, 0.2)", color: "#34d399" }}
                >
                  <Sparkles size={18} />
                  <span>Download / Install App</span>
                </button>

                {isMobileSimulated && !isMobileViewport && (
                  <button
                    className="sheet-link-btn"
                    type="button"
                    onClick={() => { setIsMobileSimulated(false); setShowMoreDrawer(false); }}
                    style={{ border: "1px dashed rgba(167, 139, 250, 0.4)", color: "#a78bfa" }}
                  >
                    <Play size={18} />
                    <span>Exit Mobile Simulator</span>
                  </button>
                )}

                {username ? (
                  <button
                    className="sheet-link-btn logout"
                    type="button"
                    onClick={() => {
                      safeRemoveLocalStorage("nova_jwt_token");
                      safeRemoveLocalStorage("nova_username");
                      setToken(null);
                      setUsername(null);
                      setShowMoreDrawer(false);
                      openHome();
                    }}
                  >
                    <LogOut size={18} />
                    <span>Sign Out</span>
                  </button>
                ) : (
                  <button
                    className="sheet-link-btn"
                    type="button"
                    onClick={() => { setShowAuthModal(true); setShowMoreDrawer(false); }}
                    style={{ background: "var(--accent)" }}
                  >
                    <User size={18} />
                    <span>Sign In</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {dialogMovie && (
          <MovieDialog
            movie={dialogMovie}
            feedback={feedbackByMovieId[dialogMovie.id]}
            onFeedback={recordFeedback}
            onRating={recordRating}
            onClose={() => setDialogMovie(null)}
          />
        )}
        {showAuthModal && (
          <AuthModal
            onLogin={(tok, user) => { setToken(tok); setUsername(user); setShowAuthModal(false); }}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </div>
    );

    if (isMobileSimulated && !isMobileViewport) {
      return (
        <div className="phone-simulator-container">
          <div className="simulator-controls">
            <span className="simulator-badge">Simulator Mode</span>
            <button className="simulator-toggle-btn" type="button" onClick={() => setIsMobileSimulated(false)}>
              <Play size={14} style={{ transform: "rotate(180deg)" }} />
              Back to Widescreen
            </button>
          </div>
          <div className="iphone-mockup">
            <div className="dynamic-island" />
            <div className="simulator-status-bar">
              <span>9:41</span>
              <div className="status-bar-right" style={{ display: "flex", gap: "4px" }}>
                <Server size={10} />
                <Activity size={10} />
                <Database size={10} />
              </div>
            </div>
            {mobileContent}
            <div className="home-indicator" />
          </div>
        </div>
      );
    }

    return mobileContent;
  }

  // ── App Shell Pages (Browse, Search, Dashboard, KG, Eval, Profile, Admin) ─
  if (isAppPage) {
    const navLinks = [
      { id: "home", label: "Explore" },
      { id: "search", label: "Search" },
      { id: "vector-space", label: "3D Galaxy" },
      { id: "data-platform", label: "Data Platform" },
      { id: "dashboard", label: "Dashboard" },
      { id: "knowledge-graph", label: "Graph" },
      { id: "evaluation", label: "Evaluation" },
      { id: "profile", label: "Watchlist" },
    ];

    return (
      <div className="app-container" id="main-content">
        <a href="#main-content" className="skip-link">Skip to main content</a>

        {/* Unified Sticky top navigation header */}
        <header className="topbar">
          <div className="topbar-left">
            <div style={{ display: "flex", alignItems: "center" }}>
              <button className="brand-logo" type="button" onClick={openHome} aria-label="NOVA Home">NOVA</button>
            </div>
            <nav className="topbar-links" aria-label="Main navigation">
              {navLinks.map((link, idx) => (
                <React.Fragment key={link.id}>
                  {idx === 3 && <span className="topbar-nav-divider" key="div-platform" aria-hidden="true" />}
                  {idx === 4 && <span className="topbar-nav-divider" key="div-mlops" aria-hidden="true" />}
                  {idx === 7 && <span className="topbar-nav-divider" key="div-profile" aria-hidden="true" />}
                  <button
                    className={`topbar-link ${page === link.id ? "active" : ""}`}
                    type="button"
                    onClick={() => {
                      if (link.id === "home") openHome();
                      else if (link.id === "search") openSearch();
                      else navigateTo(link.id as AppPage);
                    }}
                  >
                    {link.label}
                  </button>
                </React.Fragment>
              ))}
            </nav>
          </div>
          <div className="topbar-right">
            {/* Header Search Box */}
            <div className="topbar-search">
              {mode === "semantic" ? <Sparkles size={14} className="mode-icon-semantic" /> : <Search size={14} />}
              <input
                type="text"
                placeholder={mode === "title" ? "Search movies..." : "Search by plot/desc..."}
                value={titleQuery}
                onChange={(event) => {
                  userStarted.current = true;
                  setMode(mode);
                  setTitleQuery(event.target.value);
                  if (page !== "search") {
                    setPage("search");
                  }
                  setTitleSelectOpen(true);
                  if (selectedMovie && event.target.value !== selectedTitleLabel) {
                    setSelectedMovie(null);
                    setResults([]);
                    setResultsKind("idle");
                    setRecommendationSource(null);
                    setDialogMovie(null);
                    setLastRecommendationRequestId(null);
                  }
                }}
                onFocus={() => {
                  if (page !== "search") {
                    setPage("search");
                  }
                  setTitleSelectOpen(true);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    setTitleSelectOpen(false);
                    return;
                  }
                  if (event.key === "Enter") {
                    event.preventDefault();
                    setTitleSelectOpen(false);
                    void runSearch(mode);
                  }
                }}
              />
              <button
                className={`header-mode-toggle ${mode === "semantic" ? "semantic-active" : ""}`}
                type="button"
                title={mode === "title" ? "Switch to AI/Plot search" : "Switch to Title search"}
                onClick={() => {
                  setMode(mode === "title" ? "semantic" : "title");
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: mode === "semantic" ? "#a78bfa" : "var(--quiet)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  padding: "4px",
                  borderRadius: "50%",
                  transition: "all 0.2s ease"
                }}
              >
                <Sparkles size={14} />
              </button>
              {titleQuery && (
                <button
                  className="clear-search-btn"
                  type="button"
                  onClick={() => {
                    userStarted.current = true;
                    setTitleQuery("");
                    setSelectedMovie(null);
                    setResults([]);
                    setResultsKind("idle");
                    setRecommendationSource(null);
                    setDialogMovie(null);
                    setLastRecommendationRequestId(null);
                    setTitleSelectOpen(true);
                  }}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--quiet)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    padding: "2px"
                  }}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            {username ? (
              <div className="user-profile-menu">
                <button className="profile-btn" type="button" onClick={() => navigateTo("profile")}>
                  <User size={14} aria-hidden="true" /> <span className="profile-greet">Hi, </span><strong>{username}</strong>
                </button>
                <button
                  className="logout-btn"
                  type="button"
                  onClick={() => {
                    safeRemoveLocalStorage("nova_jwt_token");
                    safeRemoveLocalStorage("nova_username");
                    setToken(null);
                    setUsername(null);
                    openHome();
                  }}
                  title="Logout"
                  aria-label="Logout"
                >
                  <LogOut size={14} aria-hidden="true" />
                </button>
              </div>
            ) : (
              <button className="signin-nav-btn" type="button" onClick={() => setShowAuthModal(true)}>
                Sign In
              </button>
            )}
          </div>
        </header>

        <div className="app-content-area">
          {page === "home" && (
            <HomePage
              movies={homeMovies}
              heroIndex={homeHeroIndex}
              loading={homeLoading}
              error={homeError}
              onHeroIndex={setHomeHeroIndex}
              onOpenMovie={setDialogMovie}
              recentMovies={recentMovies}
              forYouMovies={forYouMovies}
              forYouLoading={forYouLoading}
              latestMovies={latestMovies}
              latestLoading={latestLoading}
              homeMode={homeMode}
              onToggleMode={setHomeMode}
              onNavigate={(p) => setPage(p as AppPage)}
              onHoverMovie={_prefetchMovieIntent}
            />
          )}

          {page === "search" && (
            <main className="search-page-layout">
              <section className="metrics-strip" aria-label="Platform snapshot">
                <MetricTile icon={<Database size={18} />} label="Catalog" value={catalogValue ? catalogValue.toLocaleString() : "Loading"} />
                <MetricTile icon={<Server size={18} />} label="Readiness" value={readinessLabel(readinessReport)} />
                <MetricTile icon={<BarChart3 size={18} />} label="Ranking" value={rankerValue} />
                <MetricTile icon={<Gauge size={18} />} label="Quality" value={qualityLabel(qualityReport)} />
                <MetricTile icon={<Activity size={18} />} label="Artifacts" value={healthLabel(artifactReport)} />
              </section>

              <section className="workspace">
                <div className="control-panel">

                  <div className="control-heading">
                    <Search size={44} />
                    <h1>Search & Discover</h1>
                  </div>

                  <div className="search-mode-tabs" style={{ display: "flex", gap: "8px", marginBottom: "20px" }}>
                    <button
                      className={`search-mode-tab ${mode === "title" ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setMode("title");
                        userStarted.current = true;
                      }}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "24px",
                        border: "1px solid " + (mode === "title" ? "rgba(99, 102, 241, 0.4)" : "rgba(255, 255, 255, 0.08)"),
                        background: mode === "title" ? "rgba(99, 102, 241, 0.15)" : "rgba(255, 255, 255, 0.02)",
                        color: mode === "title" ? "#a5b4fc" : "var(--muted)",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                      }}
                    >
                      <Search size={14} />
                      Title Search
                    </button>
                    <button
                      className={`search-mode-tab ${mode === "semantic" ? "active" : ""}`}
                      type="button"
                      onClick={() => {
                        setMode("semantic");
                        userStarted.current = true;
                      }}
                      style={{
                        padding: "10px 20px",
                        borderRadius: "24px",
                        border: "1px solid " + (mode === "semantic" ? "rgba(167, 139, 250, 0.4)" : "rgba(255, 255, 255, 0.08)"),
                        background: mode === "semantic" ? "rgba(167, 139, 250, 0.15)" : "rgba(255, 255, 255, 0.02)",
                        color: mode === "semantic" ? "#c084fc" : "var(--muted)",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                      }}
                    >
                      <Sparkles size={14} />
                      AI Semantic Search
                    </button>
                  </div>

                  <div
                    className="title-select"
                    ref={titleSelectRef}
                    onBlur={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setTitleSelectOpen(false);
                      }
                    }}
                  >
                    <div className="search-box title-select-box" style={{ display: "flex", alignItems: "center", width: "100%", position: "relative" }}>
                      {mode === "semantic" ? <Sparkles size={18} className="mode-icon-semantic" style={{ color: "#a78bfa", flexShrink: 0 }} /> : <Search size={18} style={{ color: "var(--quiet)", flexShrink: 0 }} />}
                      <input
                        id="title-search"
                        value={titleQuery}
                        onChange={(event) => {
                          userStarted.current = true;
                          setMode(mode);
                          setTitleQuery(event.target.value);
                          setTitleSelectOpen(true);
                          if (selectedMovie && event.target.value !== selectedTitleLabel) {
                            setSelectedMovie(null);
                            setResults([]);
                          }
                        }}
                        onFocus={() => setTitleSelectOpen(true)}
                        onKeyDown={(event) => {
                          if (event.key === "Escape") {
                            setTitleSelectOpen(false);
                            return;
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            setTitleSelectOpen(false);
                            void runSearch(mode);
                          }
                        }}
                        placeholder={mode === "title" ? "Search by title, e.g. Inception..." : "Describe a plot, mood, or genre..."}
                        style={{ marginLeft: "8px", flex: 1 }}
                      />
                      {hasTitleQuery && (
                        <button
                          className="clear-title"
                          type="button"
                          aria-label="Clear selected title"
                          onClick={() => {
                            userStarted.current = true;
                            setTitleQuery("");
                            setSelectedMovie(null);
                            setResults([]);
                            setResultsKind("idle");
                            setRecommendationSource(null);
                            setDialogMovie(null);
                            setLastRecommendationRequestId(null);
                            setTitleSelectOpen(true);
                          }}
                          style={{ background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", display: "grid", placeItems: "center", padding: "4px", marginRight: "8px" }}
                        >
                          <X size={16} />
                        </button>
                      )}
                      <button
                        className="search-btn-primary"
                        type="button"
                        onClick={() => runSearch(mode)}
                        aria-label="Search"
                        style={{
                          background: mode === "semantic" ? "linear-gradient(135deg, #a78bfa, #818cf8)" : "linear-gradient(135deg, #6366f1, #4f46e5)",
                          color: "#fff",
                          border: "none",
                          borderRadius: "8px",
                          padding: "8px 20px",
                          fontWeight: 700,
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "8px",
                          boxShadow: "0 4px 12px rgba(99, 102, 241, 0.2)",
                          transition: "all 0.2s ease",
                          flexShrink: 0
                        }}
                      >
                        {mode === "semantic" ? <Sparkles size={14} /> : <Search size={14} />}
                        <span>Search</span>
                      </button>
                    </div>

                    {showTitleSuggestions && mode === "title" && (
                      <div className="title-list streamlit-title-list">
                        {titles.length === 0 && catalogState !== "ready" && <span className="quiet-line">Loading movie catalog...</span>}
                        {filteredTitles.slice(0, 12).map((item) => (
                          <button
                            type="button"
                            key={`${item.id}-${item.title}`}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => void chooseTitle(item, { autoRecommend: true })}
                          >
                            {item.title}
                          </button>
                        ))}
                        {titles.length > 0 && filteredTitles.length === 0 && <span className="quiet-line">No title match. Try AI search mode.</span>}
                      </div>
                    )}
                  </div>

                  {showNotice && (
                    <div className={`notice ${catalogState}`}>
                      <span>{notice}</span>
                      <button type="button" onClick={() => void bootstrap(true)}>
                        Retry now
                      </button>
                    </div>
                  )}

                  <details className="ops-details">
                    <summary>
                      <span>Platform signals</span>
                      <small>{readinessLabel(readinessReport)} readiness</small>
                    </summary>
                    <div className="ops-stack">
                      <ReadinessPanel report={readinessReport} loading={signalsLoading} onRefresh={loadOperationalSignals} />
                      <DiagnosticsPanel health={artifactReport} />
                      <QualityPanel report={qualityReport} />
                    </div>
                  </details>
                </div>

                <div className="result-panel">
                  {selectedMovie && !isEditingTitle ? (
                    <MovieSpotlight
                      movie={selectedMovie}
                      loading={loadingRecs}
                      onRecommend={() => void recommend()}
                      userId={username}
                      sessionId={sessionId}
                    />
                  ) : null}

                  {isSearching ? (
                    <section className="results-section">
                      <div className="section-title">
                        <div>
                          <span>{mode === "semantic" ? "AI Semantic Search" : "Catalog Search"}</span>
                          <h2>{mode === "semantic" ? "Searching catalog by intent..." : "Searching movie database..."}</h2>
                        </div>
                      </div>
                      <div className="poster-grid">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div key={index} className="recommendation-card skeleton-card" style={{ height: "380px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                            <div className="skeleton" style={{ height: "180px", borderRadius: "12px" }}></div>
                            <div className="skeleton" style={{ height: "24px", width: "80%", borderRadius: "6px" }}></div>
                            <div className="skeleton" style={{ height: "16px", width: "40%", borderRadius: "4px" }}></div>
                            <div className="skeleton" style={{ height: "48px", width: "100%", borderRadius: "8px" }}></div>
                            <div style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
                              <div className="skeleton" style={{ height: "28px", width: "70px", borderRadius: "20px" }}></div>
                              <div className="skeleton" style={{ height: "28px", width: "70px", borderRadius: "20px" }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : loadingRecs ? (
                    <section className="results-section">
                      <div className="section-title">
                        <div>
                          <span>Ensemble pipeline</span>
                          <h2>Generating recommendations...</h2>
                        </div>
                      </div>
                      <div className="poster-grid">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <div key={index} className="recommendation-card skeleton-card" style={{ height: "380px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "16px", padding: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
                            <div className="skeleton" style={{ height: "180px", borderRadius: "12px" }}></div>
                            <div className="skeleton" style={{ height: "24px", width: "80%", borderRadius: "6px" }}></div>
                            <div className="skeleton" style={{ height: "16px", width: "40%", borderRadius: "4px" }}></div>
                            <div className="skeleton" style={{ height: "48px", width: "100%", borderRadius: "8px" }}></div>
                            <div style={{ display: "flex", gap: "8px", marginTop: "auto" }}>
                              <div className="skeleton" style={{ height: "28px", width: "70px", borderRadius: "20px" }}></div>
                              <div className="skeleton" style={{ height: "28px", width: "70px", borderRadius: "20px" }}></div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ) : results.length > 0 ? (
                    <section className="results-section">
                      <div className="section-title">
                        <div>
                          <span>{resultsKind === "recommendations" ? "Ranked set" : "Catalog results"}</span>
                          <h2>{resultHeading}</h2>
                          {feedbackNotice && <small className="feedback-status">{feedbackNotice}</small>}
                        </div>
                        <strong>{results.length} titles</strong>
                      </div>
                      <ResultContextBar
                        kind={resultsKind}
                        backend={backend}
                        sourceMovie={recommendationSource || selectedMovie}
                        requestId={lastRecommendationRequestId}
                        query={activeQuery}
                      />
                      <div className="poster-grid">
                        {results.map((movie, index) => (
                          <RecommendationCard
                            key={`${movie.id}-${movie.title}`}
                            movie={movie}
                            rank={index + 1}
                            onSelect={selectResultMovie}
                            feedback={feedbackByMovieId[movie.id]}
                            onFeedback={recordFeedback}
                          />
                        ))}
                      </div>
                    </section>
                  ) : results.length === 0 && resultsKind === "search" && titleQuery.trim() && !isSearching && !isSelecting ? (
                    <section className="results-section no-results">
                      <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
                        <Film size={48} style={{ marginBottom: "16px", opacity: 0.5 }} />
                        <h3>No matches found for &quot;{titleQuery}&quot;</h3>
                        <p style={{ fontSize: "0.9rem" }}>Try checking your spelling or describe a plot using our AI Search mode!</p>
                      </div>
                    </section>
                  ) : resultsKind === "idle" && titleQuery.trim() && !isSearching && !isSelecting ? (
                    <section className="results-section no-results">
                      <div style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
                        <Sparkles size={48} className="mode-icon-semantic" style={{ marginBottom: "16px", opacity: 0.5, color: "var(--accent)" }} />
                        <h3>Press Enter to search by intent</h3>
                        <p style={{ fontSize: "0.9rem" }}>Type your query and press Enter, or wait a moment for AI Search to automatically run.</p>
                      </div>
                    </section>
                  ) : !titleQuery.trim() ? (
                    <section className="results-section">
                      <div className="section-title">
                        <div>
                          <span>Trending</span>
                          <h2>Popular Searches</h2>
                        </div>
                      </div>
                      <div className="poster-grid">
                        {latestMovies.slice(0, 6).map((movie) => (
                          <button
                            type="button"
                            key={`popular-${movie.id}`}
                            className="popular-search-card"
                            onPointerEnter={() => prefetchMovie(movie.id)}
                            onClick={() => {
                              setTitleQuery(selectTitleLabel(movie));
                              selectMovie(movie, "title_search");
                              void recommend(movie);
                            }}
                            style={{
                              background: "rgba(255,255,255,0.02)",
                              border: "1px solid rgba(255,255,255,0.05)",
                              borderRadius: "16px",
                              padding: "12px",
                              cursor: "pointer",
                              display: "flex",
                              flexDirection: "column",
                              gap: "8px",
                              textAlign: "left",
                              transition: "all 0.2s ease"
                            }}
                          >
                            <img
                              src={posterUrl(movie.poster_path)}
                              alt={movie.title}
                              style={{ width: "100%", aspectRatio: "2/3", objectFit: "cover", borderRadius: "10px" }}
                            />
                            <strong style={{ fontSize: "0.9rem", color: "#fff", display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{movie.title}</strong>
                            <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{movieYear(movie)}</span>
                          </button>
                        ))}
                      </div>

                      {recentMovies.length > 0 && (
                        <div className="recent-picks-section" style={{ marginTop: "24px" }}>
                          <div className="section-title" style={{ marginBottom: "12px" }}>
                            <div>
                              <span>Recent</span>
                              <h2>Recent Picks</h2>
                            </div>
                          </div>
                          <div className="recent-list" style={{ display: "flex", gap: "12px", overflowX: "auto", paddingBottom: "8px" }}>
                            {recentMovies.map((movie) => (
                              <button
                                type="button"
                                key={`recent-${movie.id}`}
                                onPointerEnter={() => prefetchMovie(movie.id)}
                                onClick={() => {
                                  setTitleQuery(selectTitleLabel(movie));
                                  selectMovie(movie, "recent_pick");
                                  void recommend(movie);
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "12px",
                                  padding: "8px 16px",
                                  background: "rgba(255, 255, 255, 0.02)",
                                  border: "1px solid rgba(255, 255, 255, 0.05)",
                                  borderRadius: "12px",
                                  cursor: "pointer",
                                  flex: "0 0 auto",
                                  maxWidth: "240px",
                                  textAlign: "left"
                                }}
                              >
                                <img
                                  src={posterUrl(movie.poster_path)}
                                  alt=""
                                  loading="lazy"
                                  style={{ width: "32px", aspectRatio: "2/3", objectFit: "cover", borderRadius: "4px" }}
                                />
                                <span style={{ fontSize: "0.85rem", color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{movie.title}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </section>
                  ) : null}
                </div>
              </section>
            </main>
          )}

          <React.Suspense fallback={<SuspenseFallback />}>
            {page === "vector-space" && <main className="app-shell inner-shell"><ErrorBoundary><VectorSpace onSelectMovie={(movie) => setDialogMovie(movie)} titles={titles} /></ErrorBoundary></main>}
            {page === "data-platform" && <main className="app-shell inner-shell"><ErrorBoundary><DataEngineeringPage /></ErrorBoundary></main>}
            {page === "dashboard" && <main className="app-shell inner-shell"><ErrorBoundary><Dashboard /></ErrorBoundary></main>}
            {page === "knowledge-graph" && <main className="app-shell inner-shell"><ErrorBoundary><KnowledgeGraphPage titles={titles} /></ErrorBoundary></main>}
            {page === "evaluation" && <main className="app-shell inner-shell"><ErrorBoundary><EvaluationPage /></ErrorBoundary></main>}
            {page === "profile" && (
              <main className="app-shell inner-shell">
                <ErrorBoundary>
                  <UserProfilePage
                    token={token}
                    username={username}
                    onRequestLogin={() => setShowAuthModal(true)}
                    onSelectMovie={(movie) => { setDialogMovie(movie); }}
                    onNavigate={(p) => setPage(p as AppPage)}
                  />
                </ErrorBoundary>
              </main>
            )}
            {page === "admin" && <main className="app-shell inner-shell"><ErrorBoundary><AdminPanel token={token} /></ErrorBoundary></main>}
          </React.Suspense>
        </div>

        {dialogMovie && (
          <MovieDialog
            movie={dialogMovie}
            feedback={feedbackByMovieId[dialogMovie.id]}
            onFeedback={recordFeedback}
            onRating={recordRating}
            onClose={() => setDialogMovie(null)}
          />
        )}
        {showAuthModal && (
          <AuthModal
            onLogin={(tok, user) => { setToken(tok); setUsername(user); setShowAuthModal(false); }}
            onClose={() => setShowAuthModal(false)}
          />
        )}
      </div>
    );
  }

  return null;
}

const rootElement = document.getElementById("root");
if (rootElement) {
  createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </React.StrictMode>,
  );
}

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    try {
      if (window.self === window.top) {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => console.log("Service Worker registered successfully:", reg.scope))
          .catch((err) => console.warn("Service Worker registration skipped:", err));
      }
    } catch {
      // Ignore iframe sandboxed service worker restriction
    }
  });
}
