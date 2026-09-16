//! Pure Rust APEX Serving Engine (`apex_server`) built with Axum 0.7, Tokio, and Rayon.

mod catalog;
mod routes;
mod simd;
mod state;
mod vector_store;

use axum::{
    http::StatusCode,
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::json;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tower_http::services::{ServeDir, ServeFile};

use crate::state::AppState;

/// Fallback handler for unmatched routes when static directory is not configured.
async fn fallback_404_handler() -> impl IntoResponse {
    (
        StatusCode::NOT_FOUND,
        Json(json!({
            "error": "Not Found",
            "status": "not_found",
            "detail": "The requested resource does not exist."
        })),
    )
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("========================================================================");
    println!("🚀 Pure Rust APEX Serving Backend (Axum 0.7 + Tokio + SIMD Engine)");
    println!("========================================================================");

    // Initialize shared state and load datasets
    let state = AppState::init().map_err(|e| {
        eprintln!("❌ Fatal error initializing AppState: {}", e);
        e
    })?;

    // Configure CORS for cross-origin frontend communication
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    // Construct REST API Router
    let mut app = Router::new()
        // Metadata & Health
        .route("/", get(routes::root_handler))
        .route("/health", get(routes::health_handler))
        // Recommendations
        .route(
            "/v1/recommendations/id/:id",
            get(routes::get_recommendations_by_id_handler),
        )
        .route(
            "/recommend/id/:id",
            get(routes::get_recommendations_by_id_handler),
        )
        .route(
            "/v1/recommendations",
            post(routes::post_recommendations_handler),
        )
        // Search
        .route("/v1/search", get(routes::get_search_handler).post(routes::post_search_handler))
        .route("/v1/search/ai", get(routes::get_ai_search_handler))
        // Catalog & Titles
        .route("/v1/catalog", get(routes::get_catalog_handler))
        .route("/v1/catalog/browse", get(routes::get_catalog_handler))
        .route("/movies/titles", get(routes::get_movie_titles_handler))
        .route("/movies/showcase", get(routes::get_movie_showcase_handler))
        .route("/movie/:id", get(routes::get_movie_by_id_handler))
        .route("/movie/:id/trailer", get(routes::get_movie_trailer_handler))
        .route("/movie/:id/enriched", get(routes::get_movie_enriched_handler))
        .route(
            "/v1/recommendations/id/:id/enriched",
            get(routes::get_recommendations_by_id_handler),
        )
        // Telemetry Events
        .route("/v1/events", post(routes::post_events_handler))
        // Authentication
        .route("/v1/auth/token", post(routes::post_auth_token_handler))
        .route("/api/v1/auth/token", post(routes::post_auth_token_handler))
        .route("/auth/token", post(routes::post_auth_token_handler))
        .route("/v1/auth/login", post(routes::post_auth_login_handler))
        .route("/api/v1/auth/login", post(routes::post_auth_login_handler))
        .route("/auth/login", post(routes::post_auth_login_handler))
        .route("/v1/auth/register", post(routes::post_auth_register_handler))
        .route("/api/v1/auth/register", post(routes::post_auth_register_handler))
        .route("/auth/register", post(routes::post_auth_register_handler))
        // System & Benchmarks
        .route("/v1/admin/status", get(routes::get_admin_status_handler))
        .route(
            "/v1/evaluation/benchmark",
            get(routes::get_evaluation_benchmark_handler),
        )
        .route("/v1/billing/usage", get(routes::get_billing_usage_handler))
        .route("/v1/pipeline/run", post(routes::post_pipeline_run_handler))
        .layer(cors)
        .with_state(Arc::clone(&state));

    // Optional Static Asset Serving with SPA Fallback
    let static_candidates = [
        std::env::var("STATIC_DIR").ok().unwrap_or_default(),
        "/app/dist".to_string(),
        "frontend/dist".to_string(),
        "../frontend/dist".to_string(),
        "../../frontend/dist".to_string(),
        "./dist".to_string(),
        "/app/frontend/dist".to_string(),
    ];

    let mut static_dir_found = None;
    for candidate in &static_candidates {
        if !candidate.is_empty() {
            let p = PathBuf::from(candidate);
            if p.is_dir() {
                static_dir_found = Some(p);
                break;
            }
        }
    }

    if let Some(dist_dir) = static_dir_found {
        let index_html = dist_dir.join("index.html");
        if index_html.is_file() {
            println!("📦 Serving static assets from {:?} with SPA fallback", dist_dir);
            let serve_dir = ServeDir::new(&dist_dir).fallback(ServeFile::new(index_html));
            app = app.fallback_service(serve_dir);
        } else {
            println!("📦 Serving static assets from {:?}", dist_dir);
            let serve_dir = ServeDir::new(&dist_dir);
            app = app.fallback_service(serve_dir);
        }
    } else {
        app = app.fallback(fallback_404_handler);
    }

    // Dynamic Port Binding (PORT env var with fallback to 8080)
    let port_str = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let port: u16 = port_str.parse().unwrap_or(8080);
    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    println!("🌐 Pure Rust APEX Server listening on http://0.0.0.0:{}", port);
    println!("⚡ Vector search and Axum API routes active with ZERO Python dependencies.");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
