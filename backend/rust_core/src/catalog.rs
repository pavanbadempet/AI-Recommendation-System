//! Movie catalog metadata store, title formatting, and in-memory search index.

use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use std::sync::Arc;

/// Full metadata representation for a movie item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovieMetadata {
    pub id: i64,
    pub title: String,
    #[serde(default)]
    pub overview: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub vote_average: f64,
    #[serde(default)]
    pub vote_count: f64,
    #[serde(default)]
    pub popularity: f64,
    #[serde(default)]
    pub release_date: Option<String>,
    #[serde(default)]
    pub poster_path: Option<String>,
}

/// Simplified title entry for autocomplete endpoints.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovieTitleEntry {
    pub id: i64,
    pub title: String,
}

/// Search match candidate item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MovieSearchResult {
    pub id: i64,
    pub title: String,
    #[serde(default)]
    pub overview: Option<String>,
    #[serde(default)]
    pub genres: Vec<String>,
    #[serde(default)]
    pub poster_path: Option<String>,
    #[serde(default)]
    pub vote_average: f64,
    pub score: f64,
    pub similarity_score: f64,
}

/// In-memory movie catalog store with search and showcase indices.
pub struct MovieCatalog {
    pub movies: Vec<MovieMetadata>,
    pub id_to_index: HashMap<i64, usize>,
    pub showcase_movies: Vec<MovieMetadata>,
    pub title_entries: Vec<MovieTitleEntry>,
}

impl MovieCatalog {
    /// Load movie catalog JSON from disk and build in-memory indices.
    pub fn load(catalog_path: &Path) -> Result<Arc<Self>, String> {
        let file = File::open(catalog_path)
            .map_err(|e| format!("Failed to open catalog file {:?}: {}", catalog_path, e))?;
        let reader = BufReader::new(file);
        let movies: Vec<MovieMetadata> = serde_json::from_reader(reader)
            .map_err(|e| format!("Failed to parse catalog JSON: {}", e))?;

        let mut id_to_index = HashMap::with_capacity(movies.len());
        let mut title_entries = Vec::with_capacity(movies.len());

        for (idx, m) in movies.iter().enumerate() {
            id_to_index.insert(m.id, idx);

            // Extract release year from release_date (e.g. "1988-10-21" -> "1988")
            let year_str = if let Some(ref rd) = m.release_date {
                if rd.len() >= 4 {
                    &rd[..4]
                } else {
                    ""
                }
            } else {
                ""
            };

            let formatted_title = if !year_str.is_empty() {
                if !m.genres.is_empty() {
                    format!("{} ({}) - {}", m.title, year_str, m.genres.join(", "))
                } else {
                    format!("{} ({})", m.title, year_str)
                }
            } else if !m.genres.is_empty() {
                format!("{} - {}", m.title, m.genres.join(", "))
            } else {
                m.title.clone()
            };

            title_entries.push(MovieTitleEntry {
                id: m.id,
                title: formatted_title,
            });
        }

        // Curate showcase movies: sorted by popularity descending with valid poster_path
        let mut showcase = movies
            .iter()
            .filter(|m| m.poster_path.as_ref().map(|p| !p.trim().is_empty()).unwrap_or(false))
            .cloned()
            .collect::<Vec<_>>();
        showcase.sort_unstable_by(|a, b| {
            b.popularity
                .partial_cmp(&a.popularity)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        showcase.truncate(100);

        Ok(Arc::new(MovieCatalog {
            movies,
            id_to_index,
            showcase_movies: showcase,
            title_entries,
        }))
    }

    /// Fast O(1) lookup of a movie by its TMDB movie_id.
    pub fn get_by_id(&self, movie_id: i64) -> Option<&MovieMetadata> {
        self.id_to_index.get(&movie_id).map(|&idx| &self.movies[idx])
    }

    /// Fast O(1) lookup of a movie by its 0-indexed row position.
    pub fn get_by_row(&self, row: usize) -> Option<&MovieMetadata> {
        self.movies.get(row)
    }

    /// Text query search across titles, genres, and overviews.
    pub fn search(&self, query: &str, limit: usize) -> Vec<MovieSearchResult> {
        let trimmed = query.trim().to_lowercase();
        if trimmed.is_empty() || limit == 0 {
            return Vec::new();
        }

        let query_tokens: Vec<&str> = trimmed
            .split(|c: char| !c.is_alphanumeric())
            .filter(|s| !s.is_empty())
            .collect();

        if query_tokens.is_empty() {
            return Vec::new();
        }

        // Parallel score calculation across catalog
        let mut scored_results: Vec<MovieSearchResult> = self
            .movies
            .par_iter()
            .filter_map(|m| {
                let title_lower = m.title.to_lowercase();
                let mut score = 0.0f64;

                // Exact title match
                if title_lower == trimmed {
                    score += 100.0;
                } else if title_lower.contains(&trimmed) {
                    score += 50.0;
                }

                // Token matching on title
                let mut matched_title_tokens = 0;
                for &tok in &query_tokens {
                    if title_lower.contains(tok) {
                        matched_title_tokens += 1;
                    }
                }
                if matched_title_tokens > 0 {
                    score += (matched_title_tokens as f64 / query_tokens.len() as f64) * 30.0;
                }

                // Genre matching
                let mut matched_genre = false;
                for g in &m.genres {
                    let g_lower = g.to_lowercase();
                    if g_lower == trimmed || trimmed.contains(&g_lower) {
                        score += 20.0;
                        matched_genre = true;
                    } else {
                        for &tok in &query_tokens {
                            if g_lower.contains(tok) {
                                score += 10.0;
                                matched_genre = true;
                            }
                        }
                    }
                }

                // Overview token matching
                if let Some(ref ov) = m.overview {
                    let ov_lower = ov.to_lowercase();
                    let mut ov_matches = 0;
                    for &tok in &query_tokens {
                        if ov_lower.contains(tok) {
                            ov_matches += 1;
                        }
                    }
                    if ov_matches > 0 {
                        score += (ov_matches as f64 / query_tokens.len() as f64) * 10.0;
                    }
                }

                if score > 0.0 || (matched_title_tokens > 0) || matched_genre {
                    // Normalize score to 0.0 - 1.0 range, lightly factoring popularity
                    let pop_boost = (m.popularity.max(0.1)).ln_1p() * 0.05;
                    let norm_score = ((score / 100.0).min(0.95) + pop_boost).min(0.99);
                    let final_score = (norm_score * 10000.0).round() / 10000.0;

                    Some(MovieSearchResult {
                        id: m.id,
                        title: m.title.clone(),
                        overview: m.overview.clone(),
                        genres: m.genres.clone(),
                        poster_path: m.poster_path.clone(),
                        vote_average: m.vote_average,
                        score: final_score,
                        similarity_score: final_score,
                    })
                } else {
                    None
                }
            })
            .collect();

        // Sort descending by score
        if scored_results.len() > limit {
            let (_left, _mid, _right) = scored_results.select_nth_unstable_by(limit, |a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            scored_results[0..limit].sort_unstable_by(|a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
            scored_results.truncate(limit);
        } else {
            scored_results.sort_unstable_by(|a, b| {
                b.score
                    .partial_cmp(&a.score)
                    .unwrap_or(std::cmp::Ordering::Equal)
            });
        }

        scored_results
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_catalog() -> MovieCatalog {
        let movies = vec![
            MovieMetadata {
                id: 1,
                title: "Inception".to_string(),
                overview: Some("A thief who steals corporate secrets through dream-sharing technology.".to_string()),
                genres: vec!["Action".to_string(), "Science Fiction".to_string(), "Adventure".to_string()],
                vote_average: 8.8,
                vote_count: 30000.0,
                popularity: 45.0,
                release_date: Some("2010-07-16".to_string()),
                poster_path: Some("/inception.jpg".to_string()),
            },
            MovieMetadata {
                id: 2,
                title: "Interstellar".to_string(),
                overview: Some("A team of explorers travel through a wormhole in space in an attempt to ensure humanity's survival.".to_string()),
                genres: vec!["Adventure".to_string(), "Drama".to_string(), "Science Fiction".to_string()],
                vote_average: 8.6,
                vote_count: 28000.0,
                popularity: 40.0,
                release_date: Some("2014-11-05".to_string()),
                poster_path: Some("/interstellar.jpg".to_string()),
            },
            MovieMetadata {
                id: 3,
                title: "The Dark Knight".to_string(),
                overview: Some("Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and DA Harvey Dent.".to_string()),
                genres: vec!["Action".to_string(), "Crime".to_string(), "Drama".to_string()],
                vote_average: 9.0,
                vote_count: 32000.0,
                popularity: 50.0,
                release_date: Some("2008-07-18".to_string()),
                poster_path: Some("/dark_knight.jpg".to_string()),
            },
        ];

        let mut id_to_index = HashMap::new();
        let mut title_entries = Vec::new();
        for (i, m) in movies.iter().enumerate() {
            id_to_index.insert(m.id, i);
            title_entries.push(MovieTitleEntry {
                id: m.id,
                title: format!("{} (2010)", m.title),
            });
        }

        MovieCatalog {
            showcase_movies: movies.clone(),
            movies,
            id_to_index,
            title_entries,
        }
    }

    #[test]
    fn test_catalog_search_exact_title() {
        let cat = create_test_catalog();
        let results = cat.search("Inception", 5);
        assert!(!results.is_empty());
        assert_eq!(results[0].id, 1);
        assert_eq!(results[0].title, "Inception");
    }

    #[test]
    fn test_catalog_search_genre() {
        let cat = create_test_catalog();
        let results = cat.search("Science Fiction", 5);
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_catalog_search_overview() {
        let cat = create_test_catalog();
        let results = cat.search("wormhole space", 5);
        assert!(!results.is_empty());
        assert_eq!(results[0].id, 2);
    }

    #[test]
    fn test_catalog_search_empty_query() {
        let cat = create_test_catalog();
        let results = cat.search("   ", 5);
        assert!(results.is_empty());
    }
}
