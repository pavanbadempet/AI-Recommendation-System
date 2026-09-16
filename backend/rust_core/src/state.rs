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
    pub user_id: i64,
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
        let emb_path = find_candidate_file(&emb_candidates)
            .ok_or_else(|| "Could not find sbert_embeddings.npy in candidate paths".to_string())?;

        // 2. Locate movie IDs file
        let ids_candidates = [
            "backend/models/movie_ids.npy",
            "models/movie_ids.npy",
            "../models/movie_ids.npy",
            "../../models/movie_ids.npy",
            "/app/models/movie_ids.npy",
            "/app/backend/models/movie_ids.npy",
        ];
        let ids_path = find_candidate_file(&ids_candidates)
            .ok_or_else(|| "Could not find movie_ids.npy in candidate paths".to_string())?;

        // 3. Locate movies catalog JSON
        let cat_candidates = [
            "backend/models/movies_catalog.json",
            "models/movies_catalog.json",
            "../models/movies_catalog.json",
            "../../models/movies_catalog.json",
            "/app/models/movies_catalog.json",
            "/app/backend/models/movies_catalog.json",
        ];
        let cat_path = find_candidate_file(&cat_candidates)
            .ok_or_else(|| "Could not find movies_catalog.json in candidate paths".to_string())?;

        println!("📂 Loading vector store from {:?}", emb_path);
        let vector_store = VectorStore::load(&emb_path, &ids_path)?;
        println!(
            "✅ Vector store loaded: {} movies, {} dimensions",
            vector_store.num_movies, vector_store.embedding_dim
        );

        println!("📂 Loading movie catalog from {:?}", cat_path);
        let catalog = MovieCatalog::load(&cat_path)?;
        println!("✅ Movie catalog loaded: {} movies", catalog.movies.len());

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
