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
    /// Build catalog from in-memory movie metadata vector.
    pub fn from_movies(movies: Vec<MovieMetadata>) -> Arc<Self> {
        let mut id_to_index = HashMap::with_capacity(movies.len());
        let mut title_entries = Vec::with_capacity(movies.len());

        for (idx, m) in movies.iter().enumerate() {
            id_to_index.insert(m.id, idx);

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

        Arc::new(MovieCatalog {
            movies,
            id_to_index,
            showcase_movies: showcase,
            title_entries,
        })
    }

    /// Load movie catalog JSON from disk and build in-memory indices.
    pub fn load(catalog_path: &Path) -> Result<Arc<Self>, String> {
        let file = File::open(catalog_path)
            .map_err(|e| format!("Failed to open catalog file {:?}: {}", catalog_path, e))?;
        let reader = BufReader::new(file);
        let movies: Vec<MovieMetadata> = serde_json::from_reader(reader)
            .map_err(|e| format!("Failed to parse catalog JSON: {}", e))?;

        Ok(Self::from_movies(movies))
    }

    /// Create high-quality built-in catalog for instant zero-dependency boot.
    pub fn create_synthetic() -> Arc<Self> {
        let raw = [
            (27205, "Inception", "A thief who steals corporate secrets through dream-sharing technology is given the inverse task of planting an idea.", vec!["Action", "Science Fiction", "Adventure"], 8.4, 34500.0, 125.4, "2010-07-15", "/8IB2e4r4oVhHn97LIXAWawzuv00.jpg"),
            (157336, "Interstellar", "The adventures of a group of explorers who make use of a newly discovered wormhole to surpass the limitations on human space travel.", vec!["Adventure", "Drama", "Science Fiction"], 8.4, 32100.0, 142.1, "2014-11-05", "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg"),
            (155, "The Dark Knight", "Batman raises the stakes in his war on crime with the help of Lt. Jim Gordon and District Attorney Harvey Dent against the Joker.", vec!["Drama", "Action", "Crime", "Thriller"], 8.5, 30500.0, 118.6, "2008-07-16", "/qJ2tW6WMUDux911r6m7haRef0WH.jpg"),
            (550, "Fight Club", "An insomniac office worker looking for a way to change his life crosses paths with a devil-may-care soap maker.", vec!["Drama", "Thriller"], 8.4, 27200.0, 98.4, "1999-10-15", "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg"),
            (680, "Pulp Fiction", "A burger-loving hit man, his philosophical partner, a drug-addled gangster's moll and a washed-up boxer converge in four tales of violence.", vec!["Thriller", "Crime"], 8.5, 26000.0, 105.1, "1994-09-10", "/d5iIlFn5s0ImszYzBPb8JPIfbXD.jpg"),
            (603, "The Matrix", "Set in the 22nd century, The Matrix tells the story of a computer hacker who joins a group of underground insurgents fighting the machines.", vec!["Action", "Science Fiction"], 8.2, 24000.0, 95.0, "1999-03-30", "/f89U3ADr1oiB1s9GkdPOEpXUk5H.jpg"),
            (238, "The Godfather", "Spanning the years 1945 to 1955, a chronicle of the fictional Italian-American Corleone crime family.", vec!["Drama", "Crime"], 8.7, 18900.0, 115.0, "1972-03-14", "/3bhkrj58Vtu7enYsRolD1fZdja1.jpg"),
            (120, "The Lord of the Rings: The Fellowship of the Ring", "Young hobbit Frodo Baggins, after inheriting a mysterious ring from his uncle Bilbo, must leave his home to destroy it.", vec!["Adventure", "Fantasy", "Action"], 8.4, 23500.0, 130.0, "2001-12-18", "/6oom5QYQ2yQTMJIbnvbkBL9cDK6.jpg"),
            (122, "The Lord of the Rings: The Return of the King", "As armies mass for a final battle that will decide the fate of the world, one member of the Fellowship of the Ring is revealed as the noble heir to the throne of Men.", vec!["Adventure", "Fantasy", "Action"], 8.5, 22400.0, 125.0, "2003-12-01", "/rCzpDGLbOoPwLjy3OAm5NUPOTrC.jpg"),
            (129, "Spirited Away", "A young girl, Chihiro, becomes trapped in a strange new world of spirits. When her parents undergo a mysterious transformation, she must call upon the courage she never knew she had.", vec!["Animation", "Family", "Fantasy"], 8.5, 15000.0, 92.0, "2001-07-20", "/39wmItIWsg5sZMyRUHLkWBcuVCM.jpg"),
            (98, "Gladiator", "In the year 180, the death of emperor Marcus Aurelius throws the Roman Empire into turmoil. Maximus Decimus Meridius is betrayed and becomes a gladiator.", vec!["Action", "Drama", "Adventure"], 8.2, 16800.0, 88.0, "2000-05-01", "/ty8TGRuvJLPUmAR1H1nRIsgwvim.jpg"),
            (19995, "Avatar", "In the 22nd century, a paraplegic Marine is dispatched to the moon Pandora on a unique mission, but becomes torn between following orders and protecting an alien civilization.", vec!["Action", "Adventure", "Fantasy", "Science Fiction"], 7.6, 29800.0, 110.0, "2009-12-15", "/kyeqWdyUXW608qlYkRqosgbbJyK.jpg"),
            (597, "Titanic", "101-year-old Rose DeWitt Bukater tells the story of her life aboard the Titanic, 84 years later. A young Rose boards the ship with her mother and fiance.", vec!["Drama", "Romance"], 7.9, 23700.0, 102.0, "1997-11-18", "/9xjZS2rlVxm8SFx8kPC3aIGCOYQ.jpg"),
            (693134, "Dune: Part Two", "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.", vec!["Science Fiction", "Adventure"], 8.3, 14200.0, 180.0, "2024-02-27", "/1pdfLvkbY9ohJlCjQH2CZjjYVvJ.jpg"),
            (872585, "Oppenheimer", "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during World War II.", vec!["Drama", "History"], 8.1, 12500.0, 160.0, "2023-07-19", "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg"),
            (496243, "Parasite", "All unemployed, Ki-taek's family takes peculiar interest in the wealthy and glamorous Parks for their livelihood until they get entangled in an unexpected incident.", vec!["Comedy", "Thriller", "Drama"], 8.5, 16500.0, 108.0, "2019-05-30", "/7IiTTgloJzvGI1TAYymCfbfl3vT.jpg"),
            (244786, "Whiplash", "Under the direction of a ruthless instructor, a talented young drummer begins to pursue perfection at any cost, even his humanity.", vec!["Drama", "Music"], 8.4, 13800.0, 85.0, "2014-10-10", "/7fn624j5lj3xTme2SgiLCeuedmO.jpg"),
            (324857, "Spider-Man: Into the Spider-Verse", "Miles Morales is juggling his life between being a high school student and being a spider-man when he crosses paths with five counterparts from other dimensions.", vec!["Animation", "Action", "Adventure", "Science Fiction"], 8.4, 14500.0, 120.0, "2018-12-06", "/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg"),
            (335984, "Blade Runner 2049", "Thirty years after the events of the first film, a new blade runner, LAPD Officer K, unearths a long-buried secret that has the potential to plunge what's left of society into chaos.", vec!["Science Fiction", "Drama"], 7.9, 12500.0, 95.0, "2017-10-04", "/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg"),
            (278, "The Shawshank Redemption", "Framed in the 1940s for the double murder of his wife and her lover, upstanding banker Andy Dufresne begins a new life at the Shawshank prison.", vec!["Drama", "Crime"], 8.7, 26000.0, 140.0, "1994-09-23", "/9cqNxx0GxF0bflZmeSMuL5tnGzr.jpg"),
            (769, "GoodFellas", "The true story of Henry Hill, a half-Irish, half-Sicilian Brooklyn kid who is adopted by neighborhood gangsters at an early age and climbs the ranks of a Mafia family.", vec!["Drama", "Crime"], 8.5, 11800.0, 78.0, "1990-09-12", "/aKuFiU82s5ISJpGZp7YkIr3kCUd.jpg"),
            (807, "Seven", "Two homicide detectives are on a desperate hunt for a serial killer whose crimes are based on the 'seven deadly sins'.", vec!["Crime", "Mystery", "Thriller"], 8.4, 19400.0, 84.0, "1995-09-22", "/69Sns8WoET6CfaYlIkHbla4l7nC.jpg"),
            (13, "Forrest Gump", "A man with a low IQ has accomplished great things in his life and been present during significant historic events—in each case, far exceeding what anyone imagined he could do.", vec!["Comedy", "Drama", "Romance"], 8.5, 25500.0, 115.0, "1994-07-06", "/arw2vcBveWOVZr6pxd9XTd1TdQa.jpg"),
            (329, "Jurassic Park", "A wealthy entrepreneur secretly creates a theme park featuring living dinosaurs drawn from prehistoric DNA.", vec!["Adventure", "Science Fiction"], 7.9, 15300.0, 90.0, "1993-06-11", "/oU7Oq2kFAAlGqbU4VoAE36g4hoI.jpg"),
            (105, "Back to the Future", "Eighties teenager Marty McFly is accidentally sent back in time to 1955 in a plutonium-powered DeLorean by his eccentric scientist friend Doc Brown.", vec!["Adventure", "Comedy", "Science Fiction"], 8.3, 18500.0, 88.0, "1985-07-03", "/fNOH9f1aA7XRTzl1sAOx9iF553Q.jpg"),
            (354912, "Coco", "Despite his family’s baffling generations-old ban on music, Miguel dreams of becoming an accomplished musician like his idol, Ernesto de la Cruz.", vec!["Animation", "Family", "Music", "Adventure"], 8.2, 17900.0, 94.0, "2017-10-27", "/gGEsBPAijhVUFoiNpgZXqRVWJt2.jpg"),
            (348, "Alien", "During its return to the earth, the commercial spaceship Nostromo intercepts a distress signal from a distant planet and discovers a deadly extraterrestrial life form.", vec!["Horror", "Science Fiction"], 8.1, 13400.0, 76.0, "1979-05-25", "/vfrQk5IPloGg1v9Rzbh2Eg3VGyM.jpg"),
            (274, "The Silence of the Lambs", "Clarice Starling is a top student at the FBI's training academy. Jack Crawford wants Clarice to interview Dr. Hannibal Lecter, a brilliant psychiatrist who is also a violent psychopath.", vec!["Crime", "Drama", "Thriller"], 8.3, 14900.0, 82.0, "1991-02-01", "/uS9m8OBk1A8eM9I042bx8XXpqAq.jpg"),
            (299534, "Avengers: Endgame", "After the devastating events of Avengers: Infinity War, the universe is in ruins. With the help of remaining allies, the Avengers assemble once more to reverse Thanos' actions.", vec!["Adventure", "Science Fiction", "Action"], 8.3, 23800.0, 155.0, "2019-04-24", "/or06FN3Dka5tukK1e9sl16pB3iy.jpg"),
            (346698, "Barbie", "Barbie and Ken are having the time of their lives in the colorful and seemingly perfect world of Barbie Land. However, when they get a chance to go to the real world, they soon discover the joys and perils of living among humans.", vec!["Comedy", "Adventure"], 7.1, 8400.0, 135.0, "2023-07-19", "/iuFNMS8U5cb6xfzi51Dbkovj7vM.jpg"),
        ];

        let movies = raw
            .iter()
            .map(|(id, title, overview, genres, vote_avg, vote_cnt, pop, rel_date, poster)| {
                MovieMetadata {
                    id: *id,
                    title: (*title).to_string(),
                    overview: Some((*overview).to_string()),
                    genres: genres.iter().map(|g| g.to_string()).collect(),
                    vote_average: *vote_avg,
                    vote_count: *vote_cnt,
                    popularity: *pop,
                    release_date: Some((*rel_date).to_string()),
                    poster_path: Some((*poster).to_string()),
                }
            })
            .collect();

        Self::from_movies(movies)
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
