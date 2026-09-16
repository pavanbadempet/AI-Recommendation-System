//! Shared application state holding memory-mapped vector store, metadata catalog, and event buffer.

use parking_lot::RwLock;
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
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
    pub timestamp: u64,
}

/// Global shared state for the Axum web server.
pub struct AppState {
    pub vector_store: Arc<VectorStore>,
    pub catalog: Arc<MovieCatalog>,
    pub events_buffer: RwLock<VecDeque<EventRecord>>,
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

        Ok(Arc::new(AppState {
            vector_store,
            catalog,
            events_buffer,
            start_time,
        }))
    }

    /// Ingest a telemetry event into the in-memory ring buffer.
    pub fn record_event(&self, event: EventRecord) {
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
            timestamp: 1700000000,
        });

        let buf = state.events_buffer.read();
        assert_eq!(buf.len(), 1);
        assert_eq!(buf[0].event_id, "evt_test_1");
    }
}
