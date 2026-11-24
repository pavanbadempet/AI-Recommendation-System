//! Shared application state holding memory-mapped vector store, metadata catalog, and event buffer.

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Instant;

use crate::catalog::MovieCatalog;
use crate::vector_store::{find_candidate_file, VectorStore};

/// Telemetry event recorded by user interactions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EventRecord {
    pub event_id: String,
    pub user_id: String,
    #[serde(default)]
    pub movie_id: Option<i64>,
    pub event_type: String,
    #[serde(default)]
    pub rating: Option<f64>,
    pub timestamp: u64,
}

/// User interaction profile maintaining ratings, watchlist, and clicks.
#[derive(Debug, Clone, Default)]
pub struct UserProfile {
    pub rated_movies: Vec<(i64, f64)>, // (movie_id, rating)
    pub watchlist_movies: Vec<i64>,
    pub clicked_movies: Vec<i64>,
    pub live_centroid: Option<Vec<f32>>,
}

impl UserProfile {
    pub fn record_interaction(&mut self, event_type: &str, movie_id: i64, rating_opt: Option<f64>) {
        match event_type {
            "rating" => {
                let r = rating_opt.unwrap_or(5.0);
                if let Some(pos) = self.rated_movies.iter().position(|(id, _)| *id == movie_id) {
                    self.rated_movies[pos].1 = r;
                } else {
                    self.rated_movies.push((movie_id, r));
                }
                self.live_centroid = None;
            }
            "watchlist_add" => {
                if !self.watchlist_movies.contains(&movie_id) {
                    self.watchlist_movies.push(movie_id);
                }
                self.live_centroid = None;
            }
            "watchlist_remove" => {
                self.watchlist_movies.retain(|&id| id != movie_id);
                self.live_centroid = None;
            }
            "click" | "view" => {
                if !self.clicked_movies.contains(&movie_id) {
                    self.clicked_movies.push(movie_id);
                }
                self.live_centroid = None;
            }
            _ => {
                if let Some(r) = rating_opt {
                    if let Some(pos) = self.rated_movies.iter().position(|(id, _)| *id == movie_id) {
                        self.rated_movies[pos].1 = r;
                    } else {
                        self.rated_movies.push((movie_id, r));
                    }
                    self.live_centroid = None;
                }
            }
        }
    }

    pub fn has_interacted(&self, movie_id: i64) -> bool {
        self.rated_movies.iter().any(|(id, _)| *id == movie_id)
            || self.watchlist_movies.contains(&movie_id)
            || self.clicked_movies.contains(&movie_id)
    }

    pub fn total_interactions(&self) -> usize {
        self.rated_movies.len() + self.watchlist_movies.len() + self.clicked_movies.len()
    }
}

/// Atomic performance metrics for server telemetry and SLO tracking.
#[derive(Debug, Default)]
pub struct ServerMetrics {
    pub total_requests: AtomicU64,
    pub total_latency_us: AtomicU64,
    pub error_count: AtomicU64,
}

impl ServerMetrics {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_request(&self, latency_us: u64, is_error: bool) {
        self.total_requests.fetch_add(1, Ordering::Relaxed);
        self.total_latency_us.fetch_add(latency_us, Ordering::Relaxed);
        if is_error {
            self.error_count.fetch_add(1, Ordering::Relaxed);
        }
    }
}

/// Global shared state for the Axum web server.
pub struct AppState {
    pub vector_store: Arc<VectorStore>,
    pub catalog: Arc<MovieCatalog>,
    pub events_buffer: RwLock<VecDeque<EventRecord>>,
    pub user_profiles: RwLock<HashMap<String, UserProfile>>,
    pub metrics: ServerMetrics,
    pub tmdb_api_key: Option<String>,
    pub tmdb_trailer_cache: RwLock<HashMap<i64, Option<String>>>,
    pub http_client: reqwest::Client,
    #[allow(dead_code)]
    pub start_time: Instant,
}

impl AppState {
    /// Initialize and load all datasets from disk.
    pub fn init() -> Result<Arc<Self>, String> {
        let start_time = Instant::now();

        // 1. Locate embeddings file
        let emb_candidates = [
            "backend/models/sbert_embeddings.npy",
            "models/sbert_embeddings.npy",
            "../models/sbert_embeddings.npy",
            "../../models/sbert_embeddings.npy",
            "/app/models/sbert_embeddings.npy",
            "/app/backend/models/sbert_embeddings.npy",
        ];
        let ids_candidates = [
            "backend/models/movie_ids.npy",
            "models/movie_ids.npy",
            "../models/movie_ids.npy",
            "../../models/movie_ids.npy",
            "/app/models/movie_ids.npy",
            "/app/backend/models/movie_ids.npy",
        ];
        let cat_candidates = [
            "backend/models/movies_catalog.json",
            "models/movies_catalog.json",
            "../models/movies_catalog.json",
            "../../models/movies_catalog.json",
            "/app/models/movies_catalog.json",
            "/app/backend/models/movies_catalog.json",
        ];
        let emb_path_opt = find_candidate_file(&emb_candidates);
        let ids_path_opt = find_candidate_file(&ids_candidates);
        let cat_path_opt = find_candidate_file(&cat_candidates);

        let (vector_store, catalog) = match (emb_path_opt, ids_path_opt, cat_path_opt) {
            (Some(emb_path), Some(ids_path), Some(cat_path)) => {
                println!("📂 Loading vector store from {:?}", emb_path);
                let vs = VectorStore::load(&emb_path, &ids_path)?;
                println!(
                    "✅ Vector store loaded: {} movies, {} dimensions",
                    vs.num_movies, vs.embedding_dim
                );
                println!("📂 Loading movie catalog from {:?}", cat_path);
                let cat = MovieCatalog::load(&cat_path)?;
                println!("✅ Movie catalog loaded: {} movies", cat.movies.len());
                (vs, cat)
            }
            _ => {
                println!("⚠️ Local precomputed binary vectors not found on disk. Initializing high-speed in-memory bootstrap catalog...");
                let cat = MovieCatalog::create_synthetic();
                let movie_ids: Vec<i64> = cat.movies.iter().map(|m| m.id).collect();
                let vs = VectorStore::create_synthetic(&movie_ids, 768);
                println!(
                    "✅ Ready with in-memory bootstrap catalog: {} movies, {} dimensions",
                    cat.movies.len(),
                    vs.embedding_dim
                );
                (vs, cat)
            }
        };

        let events_buffer = RwLock::new(VecDeque::with_capacity(1000));
        let user_profiles = RwLock::new(HashMap::new());
        let metrics = ServerMetrics::new();

        let tmdb_api_key = std::env::var("TMDB_API_KEY")
            .ok()
            .or_else(|| std::env::var("TMDB_KEY").ok())
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .or_else(|| Some("44726ef95f4d79cb7001a4947fca7f53".to_string()));

        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(8))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());

        let tmdb_trailer_cache = RwLock::new(HashMap::new());

        Ok(Arc::new(AppState {
            vector_store,
            catalog,
            events_buffer,
            user_profiles,
            metrics,
            tmdb_api_key,
            tmdb_trailer_cache,
            http_client,
            start_time,
        }))
    }

    /// Ingest a telemetry event into the in-memory ring buffer and update live user profiles.
    pub fn record_event(&self, event: EventRecord) {
        if let Some(movie_id) = event.movie_id {
            let mut profiles = self.user_profiles.write();
            let profile = profiles.entry(event.user_id.clone()).or_default();
            profile.record_interaction(&event.event_type, movie_id, event.rating);
        }

        let mut buffer = self.events_buffer.write();
        if buffer.len() >= 100_000 {
            buffer.pop_front();
        }
        buffer.push_back(event);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_state_init_always_succeeds() {
        let state = AppState::init().expect("AppState::init must always succeed via fallback if files are missing");
        assert!(state.vector_store.num_movies > 0);
        assert!(state.catalog.movies.len() > 0);
        assert_eq!(state.vector_store.num_movies, state.catalog.movies.len());
    }

    #[test]
    fn test_app_state_record_event() {
        let state = AppState::init().expect("AppState::init failed");
        state.record_event(EventRecord {
            event_id: "evt_test_1".to_string(),
            user_id: "12345".to_string(),
            movie_id: Some(27205),
            event_type: "click".to_string(),
            rating: None,
            timestamp: 1700000000,
        });

        let buf = state.events_buffer.read();
        assert_eq!(buf.len(), 1);
        assert_eq!(buf[0].event_id, "evt_test_1");

        let profiles = state.user_profiles.read();
        let user = profiles.get("12345").expect("user profile should be recorded");
        assert!(user.clicked_movies.contains(&27205));
    }

    #[test]
    fn test_user_profile_ratings_and_watchlist() {
        let mut profile = UserProfile::default();
        profile.record_interaction("rating", 155, Some(4.5));
        profile.record_interaction("watchlist_add", 27205, None);
        profile.record_interaction("click", 680, None);

        assert!(profile.has_interacted(155));
        assert!(profile.has_interacted(27205));
        assert!(profile.has_interacted(680));
        assert_eq!(profile.total_interactions(), 3);
        assert_eq!(profile.rated_movies.len(), 1);
        assert_eq!(profile.rated_movies[0], (155, 4.5));
    }
}
