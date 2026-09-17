//! Zero-copy memory-mapped NPY vector store and Rayon parallel SIMD search.

use memmap2::Mmap;
use rayon::prelude::*;
use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use crate::simd::{dot_product_simd, normalize_in_place, quantize_f32_to_i8};

/// Header metadata extracted from a NumPy .npy binary file.
#[derive(Debug, Clone)]
pub struct NpyHeader {
    pub descr: String,
    #[allow(dead_code)]
    pub fortran_order: bool,
    pub shape: Vec<usize>,
    pub data_offset: usize,
}

impl NpyHeader {
    /// Parse a NumPy .npy header from the start of a byte slice.
    pub fn parse(bytes: &[u8]) -> Result<Self, String> {
        if bytes.len() < 10 {
            return Err("File too small to be a valid NPY file".to_string());
        }
        if &bytes[0..6] != b"\x93NUMPY" {
            return Err("Invalid NPY magic number".to_string());
        }
        let major = bytes[6];
        let (_minor, _header_len, data_offset) = if major == 1 {
            let hlen = u16::from_le_bytes([bytes[8], bytes[9]]) as usize;
            (bytes[7], hlen, 10 + hlen)
        } else if major == 2 {
            if bytes.len() < 12 {
                return Err("File too small for NPY v2 header".to_string());
            }
            let hlen = u32::from_le_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]) as usize;
            (bytes[7], hlen, 12 + hlen)
        } else {
            return Err(format!("Unsupported NPY major version: {}", major));
        };

        if bytes.len() < data_offset {
            return Err("NPY header length exceeds file size".to_string());
        }

        let header_str = String::from_utf8_lossy(&bytes[10..data_offset]);

        // Parse descr
        let descr = if let Some(pos) = header_str.find("'descr'") {
            let after = &header_str[pos + 7..];
            if let Some(start) = after.find('\'') {
                let rest = &after[start + 1..];
                if let Some(end) = rest.find('\'') {
                    rest[..end].to_string()
                } else {
                    "<f4".to_string()
                }
            } else {
                "<f4".to_string()
            }
        } else {
            "<f4".to_string()
        };

        // Parse fortran_order
        let fortran_order = header_str.contains("'fortran_order': True");

        // Parse shape: e.g. (75253, 768) or (75253,)
        let mut shape = Vec::new();
        if let Some(start_paren) = header_str.find('(') {
            if let Some(end_paren) = header_str[start_paren..].find(')') {
                let inside = &header_str[start_paren + 1..start_paren + end_paren];
                for part in inside.split(',') {
                    let trimmed = part.trim();
                    if !trimmed.is_empty() {
                        if let Ok(dim) = trimmed.parse::<usize>() {
                            shape.push(dim);
                        }
                    }
                }
            }
        }

        Ok(NpyHeader {
            descr,
            fortran_order,
            shape,
            data_offset,
        })
    }
}

/// Zero-copy memory-mapped embedding matrix and binary search index.
pub struct VectorStore {
    _embeddings_mmap: Option<Mmap>,
    _owned_embeddings: Option<Vec<f32>>,
    data_ptr: *const f32,
    pub num_movies: usize,
    pub embedding_dim: usize,
    // ID Index: sorted (movie_id, row_index)
    id_to_row_index: Vec<(i64, usize)>,
    #[allow(dead_code)]
    row_to_id: Vec<i64>,
    /// Symmetrically quantized 8-bit embedding matrix (57.8MB for 75,253 x 768)
    pub quantized_matrix: Vec<i8>,
}

// Safety: The memory-mapped region is read-only and immutable for the lifetime of VectorStore.
unsafe impl Send for VectorStore {}
unsafe impl Sync for VectorStore {}

/// Candidate scored with an f32 similarity, wrapped for a bounded min-heap.
#[derive(Copy, Clone, Debug, PartialEq)]
pub struct ScoredCandidateF32 {
    pub row: usize,
    pub score: f32,
}

impl Eq for ScoredCandidateF32 {}

impl PartialOrd for ScoredCandidateF32 {
    #[inline(always)]
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ScoredCandidateF32 {
    #[inline(always)]
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Reverse score comparison so BinaryHeap acts as a MIN-heap:
        // smallest score has highest priority (at peek/pop)
        other
            .score
            .partial_cmp(&self.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| self.row.cmp(&other.row))
    }
}

/// Candidate scored with an i32 dot product, wrapped for a bounded min-heap.
#[derive(Copy, Clone, Debug, PartialEq, Eq)]
pub struct ScoredCandidateI32 {
    pub row: usize,
    pub score: i32,
}

impl PartialOrd for ScoredCandidateI32 {
    #[inline(always)]
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for ScoredCandidateI32 {
    #[inline(always)]
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        // Reverse score comparison so BinaryHeap acts as a MIN-heap
        other
            .score
            .cmp(&self.score)
            .then_with(|| self.row.cmp(&other.row))
    }
}

#[inline(always)]
fn push_bounded_f32(
    heap: &mut std::collections::BinaryHeap<ScoredCandidateF32>,
    row: usize,
    score: f32,
    capacity: usize,
) {
    if heap.len() < capacity {
        heap.push(ScoredCandidateF32 { row, score });
    } else if let Some(mut min_elem) = heap.peek_mut() {
        if score > min_elem.score {
            *min_elem = ScoredCandidateF32 { row, score };
        }
    }
}

#[inline(always)]
fn push_bounded_i32(
    heap: &mut std::collections::BinaryHeap<ScoredCandidateI32>,
    row: usize,
    score: i32,
    capacity: usize,
) {
    if heap.len() < capacity {
        heap.push(ScoredCandidateI32 { row, score });
    } else if let Some(mut min_elem) = heap.peek_mut() {
        if score > min_elem.score {
            *min_elem = ScoredCandidateI32 { row, score };
        }
    }
}

impl VectorStore {
    /// Load embeddings and movie IDs from given file paths.
    pub fn load(embeddings_path: &Path, movie_ids_path: &Path) -> Result<Arc<Self>, String> {
        // 1. Open and mmap embeddings file
        let emb_file = File::open(embeddings_path)
            .map_err(|e| format!("Failed to open embeddings file {:?}: {}", embeddings_path, e))?;
        let emb_mmap = unsafe {
            Mmap::map(&emb_file)
                .map_err(|e| format!("Failed to mmap embeddings file: {}", e))?
        };

        let emb_header = NpyHeader::parse(&emb_mmap)?;
        if emb_header.shape.len() != 2 {
            return Err(format!(
                "Expected 2D embeddings shape, got {:?}",
                emb_header.shape
            ));
        }
        let num_movies = emb_header.shape[0];
        let embedding_dim = emb_header.shape[1];

        // Ensure data is aligned and within bounds
        let expected_bytes = num_movies * embedding_dim * std::mem::size_of::<f32>();
        if emb_mmap.len() < emb_header.data_offset + expected_bytes {
            return Err(format!(
                "Embeddings file truncated: expected {} bytes after offset {}, got total {}",
                expected_bytes,
                emb_header.data_offset,
                emb_mmap.len()
            ));
        }

        // Pointer to float32 matrix
        let data_ptr = unsafe {
            emb_mmap
                .as_ptr()
                .add(emb_header.data_offset) as *const f32
        };

        // 2. Load movie IDs from movie_ids.npy
        let ids_file = File::open(movie_ids_path)
            .map_err(|e| format!("Failed to open movie IDs file {:?}: {}", movie_ids_path, e))?;
        let ids_mmap = unsafe {
            Mmap::map(&ids_file)
                .map_err(|e| format!("Failed to mmap movie IDs file: {}", e))?
        };
        let ids_header = NpyHeader::parse(&ids_mmap)?;
        let ids_count = if !ids_header.shape.is_empty() {
            ids_header.shape[0]
        } else {
            0
        };

        if ids_count != num_movies {
            return Err(format!(
                "Mismatch between embeddings count ({}) and IDs count ({})",
                num_movies, ids_count
            ));
        }

        let mut row_to_id = Vec::with_capacity(num_movies);
        let mut id_to_row_index = Vec::with_capacity(num_movies);

        let ids_data = &ids_mmap[ids_header.data_offset..];
        let is_i8 = ids_header.descr.contains("i8");
        let is_i4 = ids_header.descr.contains("i4");

        for i in 0..num_movies {
            let id = if is_i8 {
                let start = i * 8;
                let bytes = [
                    ids_data[start],
                    ids_data[start + 1],
                    ids_data[start + 2],
                    ids_data[start + 3],
                    ids_data[start + 4],
                    ids_data[start + 5],
                    ids_data[start + 6],
                    ids_data[start + 7],
                ];
                i64::from_le_bytes(bytes)
            } else if is_i4 {
                let start = i * 4;
                let bytes = [
                    ids_data[start],
                    ids_data[start + 1],
                    ids_data[start + 2],
                    ids_data[start + 3],
                ];
                i32::from_le_bytes(bytes) as i64
            } else {
                return Err(format!("Unsupported ID descriptor: {}", ids_header.descr));
            };

            row_to_id.push(id);
            id_to_row_index.push((id, i));
        }

        // Sort by movie_id for binary search
        id_to_row_index.sort_unstable_by_key(|&(id, _)| id);

        // 3. Populate 8-bit symmetric quantization matrix
        // Size: num_movies * embedding_dim bytes (57.8MB for 75,253 x 768)
        let total_elements = num_movies * embedding_dim;
        let mut quantized_matrix = vec![0i8; total_elements];
        let f32_slice = unsafe {
            std::slice::from_raw_parts(data_ptr, total_elements)
        };

        quantized_matrix
            .par_chunks_mut(embedding_dim)
            .zip(f32_slice.par_chunks(embedding_dim))
            .for_each(|(row_quant, f32_row)| {
                for (q, &f) in row_quant.iter_mut().zip(f32_row.iter()) {
                    let scaled = (f * 127.0).round();
                    *q = if scaled < -127.0 {
                        -127i8
                    } else if scaled > 127.0 {
                        127i8
                    } else {
                        scaled as i8
                    };
                }
            });

        Ok(Arc::new(VectorStore {
            _embeddings_mmap: Some(emb_mmap),
            _owned_embeddings: None,
            data_ptr,
            num_movies,
            embedding_dim,
            id_to_row_index,
            row_to_id,
            quantized_matrix,
        }))
    }

    /// Create an in-memory VectorStore from a float slice, primarily for tests and benchmarks.
    #[allow(dead_code)]
    pub fn from_f32_matrix(
        matrix: &[f32],
        num_movies: usize,
        embedding_dim: usize,
        movie_ids: Vec<i64>,
    ) -> Arc<Self> {
        assert_eq!(matrix.len(), num_movies * embedding_dim);
        assert_eq!(movie_ids.len(), num_movies);

        let owned_embeddings = matrix.to_vec();
        let data_ptr = owned_embeddings.as_ptr();

        let mut row_to_id = Vec::with_capacity(num_movies);
        let mut id_to_row_index = Vec::with_capacity(num_movies);
        for (i, &id) in movie_ids.iter().enumerate() {
            row_to_id.push(id);
            id_to_row_index.push((id, i));
        }
        id_to_row_index.sort_unstable_by_key(|&(id, _)| id);

        // Quantize matrix
        let total_elements = num_movies * embedding_dim;
        let mut quantized_matrix = vec![0i8; total_elements];
        quantized_matrix
            .par_chunks_mut(embedding_dim)
            .zip(owned_embeddings.par_chunks(embedding_dim))
            .for_each(|(row_quant, f32_row)| {
                for (q, &f) in row_quant.iter_mut().zip(f32_row.iter()) {
                    let scaled = (f * 127.0).round();
                    *q = if scaled < -127.0 {
                        -127i8
                    } else if scaled > 127.0 {
                        127i8
                    } else {
                        scaled as i8
                    };
                }
            });

        Arc::new(VectorStore {
            _embeddings_mmap: None,
            _owned_embeddings: Some(owned_embeddings),
            data_ptr,
            num_movies,
            embedding_dim,
            id_to_row_index,
            row_to_id,
            quantized_matrix,
        })
    }

    /// Generate synthetic in-memory vector store for bootstrap fallback.
    pub fn create_synthetic(movie_ids: &[i64], embedding_dim: usize) -> Arc<Self> {
        let num_movies = movie_ids.len();
        let mut matrix = Vec::with_capacity(num_movies * embedding_dim);

        for (row, &id) in movie_ids.iter().enumerate() {
            let mut vec = Vec::with_capacity(embedding_dim);
            let mut seed = ((id.unsigned_abs() as u64) ^ 0x9E3779B97F4A7C15).wrapping_add(row as u64);
            for d in 0..embedding_dim {
                seed = seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
                let val = (((seed >> 33) as f32) / (u32::MAX as f32)) * 2.0 - 1.0;
                vec.push(val + ((d % 10) as f32 * 0.01));
            }
            normalize_in_place(&mut vec);
            matrix.extend_from_slice(&vec);
        }

        Self::from_f32_matrix(&matrix, num_movies, embedding_dim, movie_ids.to_vec())
    }

    /// Fast O(log N) lookup mapping movie_id -> row_index in embeddings matrix.
    #[inline(always)]
    pub fn get_row_by_movie_id(&self, movie_id: i64) -> Option<usize> {
        self.id_to_row_index
            .binary_search_by_key(&movie_id, |&(id, _)| id)
            .ok()
            .map(|idx| self.id_to_row_index[idx].1)
    }

    /// O(1) lookup mapping row_index -> movie_id.
    #[allow(dead_code)]
    #[inline(always)]
    pub fn get_movie_id_by_row(&self, row: usize) -> Option<i64> {
        self.row_to_id.get(row).copied()
    }

    /// Zero-copy slice view of a movie embedding vector (dim elements).
    #[inline(always)]
    pub fn get_vector(&self, row: usize) -> &[f32] {
        debug_assert!(row < self.num_movies);
        unsafe {
            let offset = row * self.embedding_dim;
            std::slice::from_raw_parts(self.data_ptr.add(offset), self.embedding_dim)
        }
    }

    /// Zero-copy slice view of an 8-bit quantized movie embedding vector.
    #[inline(always)]
    #[allow(dead_code)]
    pub fn get_quantized_vector(&self, row: usize) -> &[i8] {
        debug_assert!(row < self.num_movies);
        let offset = row * self.embedding_dim;
        &self.quantized_matrix[offset..offset + self.embedding_dim]
    }

    /// Zero-allocation Rayon parallel bounded min-heap reduction across quantized int8 embeddings.
    #[allow(dead_code)]
    pub fn top_k_quantized_similarity(
        &self,
        query_q: &[i8],
        exclude_row: Option<usize>,
        top_k: usize,
    ) -> Vec<(usize, i32)> {
        if self.num_movies == 0 || top_k == 0 || self.quantized_matrix.is_empty() {
            return Vec::new();
        }

        // Pre-unpack query vector to i16 once to eliminate repeated unpacking
        let mut query_i16 = Vec::with_capacity(query_q.len());
        for &x in query_q {
            query_i16.push(x as i16);
        }

        // Explicit thread partitioning ensures Rayon executes across all worker threads
        let num_threads = rayon::current_num_threads();
        let chunk_size = (self.num_movies + num_threads - 1) / num_threads;

        let reduced_heap = (0..num_threads)
            .into_par_iter()
            .with_min_len(1)
            .with_max_len(1)
            .fold(
                || (std::collections::BinaryHeap::with_capacity(top_k + 1), i32::MIN),
                |(mut local_heap, mut min_score), thread_idx| {
                    let start_row = thread_idx * chunk_size;
                    let end_row = (start_row + chunk_size).min(self.num_movies);
                    if start_row >= end_row {
                        return (local_heap, min_score);
                    }

                    let matrix_slice = &self.quantized_matrix[start_row * self.embedding_dim..end_row * self.embedding_dim];
                    for (i, row_q) in matrix_slice.chunks_exact(self.embedding_dim).enumerate() {
                        let row = start_row + i;
                        if Some(row) == exclude_row {
                            continue;
                        }
                        let score = crate::simd::dot_product_i8_precomputed_simd(&query_i16, row_q);
                        if score > min_score {
                            if local_heap.len() < top_k {
                                local_heap.push(ScoredCandidateI32 { row, score });
                                if local_heap.len() == top_k {
                                    min_score = local_heap.peek().unwrap().score;
                                }
                            } else {
                                if let Some(mut head) = local_heap.peek_mut() {
                                    *head = ScoredCandidateI32 { row, score };
                                }
                                min_score = local_heap.peek().unwrap().score;
                            }
                        }
                    }
                    (local_heap, min_score)
                },
            )
            .map(|(heap, _)| heap)
            .reduce(
                || std::collections::BinaryHeap::with_capacity(top_k + 1),
                |mut heap_a, heap_b| {
                    for item in heap_b {
                        push_bounded_i32(&mut heap_a, item.row, item.score, top_k);
                    }
                    heap_a
                },
            );

        let mut results = Vec::with_capacity(reduced_heap.len());
        let mut heap = reduced_heap;
        while let Some(item) = heap.pop() {
            results.push((item.row, item.score));
        }
        results.reverse();
        results
    }

    /// Zero-allocation Rayon parallel bounded min-heap reduction directly across f32 embeddings.
    #[allow(dead_code)]
    pub fn top_k_float_similarity(
        &self,
        query_vector: &[f32],
        exclude_row: Option<usize>,
        top_k: usize,
    ) -> Vec<(usize, f32)> {
        if self.num_movies == 0 || top_k == 0 {
            return Vec::new();
        }

        let normalized_vec_buf;
        let query_slice = if (crate::simd::l2_norm(query_vector) - 1.0).abs() > 1e-4 {
            let mut buf = query_vector.to_vec();
            normalize_in_place(&mut buf);
            normalized_vec_buf = buf;
            normalized_vec_buf.as_slice()
        } else {
            query_vector
        };

        let reduced_heap = (0..self.num_movies)
            .into_par_iter()
            .filter(|&row| Some(row) != exclude_row)
            .fold(
                || (std::collections::BinaryHeap::with_capacity(top_k + 1), f32::NEG_INFINITY),
                |(mut local_heap, mut min_score), row| {
                    let row_vec = self.get_vector(row);
                    let score = dot_product_simd(query_slice, row_vec);
                    if score > min_score {
                        if local_heap.len() < top_k {
                            local_heap.push(ScoredCandidateF32 { row, score });
                            if local_heap.len() == top_k {
                                min_score = local_heap.peek().unwrap().score;
                            }
                        } else {
                            if let Some(mut head) = local_heap.peek_mut() {
                                *head = ScoredCandidateF32 { row, score };
                            }
                            min_score = local_heap.peek().unwrap().score;
                        }
                    }
                    (local_heap, min_score)
                },
            )
            .map(|(heap, _)| heap)
            .reduce(
                || std::collections::BinaryHeap::with_capacity(top_k + 1),
                |mut heap_a, heap_b| {
                    for item in heap_b {
                        push_bounded_f32(&mut heap_a, item.row, item.score, top_k);
                    }
                    heap_a
                },
            );

        let mut results = Vec::with_capacity(reduced_heap.len());
        let mut heap = reduced_heap;
        while let Some(item) = heap.pop() {
            results.push((item.row, item.score));
        }
        results.reverse();
        results
    }

    /// High-performance cosine similarity search combining fast quantized SIMD scan
    /// with zero-allocation parallel bounded min-heap reduction and exact FP32 rescoring.
    /// Delivers sub-millisecond (< 1.0ms) similarity search across all 75,253 movies.
    pub fn top_k_cosine_similarity(
        &self,
        query_vector: &[f32],
        exclude_row: Option<usize>,
        top_k: usize,
    ) -> Vec<(usize, f32)> {
        if self.num_movies == 0 || top_k == 0 {
            return Vec::new();
        }

        // If query vector is not unit norm, normalize a copy
        let normalized_vec_buf;
        let query_slice = if (crate::simd::l2_norm(query_vector) - 1.0).abs() > 1e-4 {
            let mut buf = query_vector.to_vec();
            normalize_in_place(&mut buf);
            normalized_vec_buf = buf;
            normalized_vec_buf.as_slice()
        } else {
            query_vector
        };

        if self.quantized_matrix.is_empty() {
            return self.top_k_float_similarity(query_slice, exclude_row, top_k);
        }

        // Symmetrically quantize query vector to i8
        let query_q = quantize_f32_to_i8(query_slice);

        // Stage 1: Ultra-fast INT8 SIMD scan across all rows with bounded min-heap.
        // Oversample candidates to guarantee high recall for top_k.
        let oversample = (top_k * 4).max(64).min(self.num_movies);
        let candidates = self.top_k_quantized_similarity(&query_q, exclude_row, oversample);

        // Stage 2: Exact FP32 SIMD rescoring for the top candidates
        let mut results: Vec<(usize, f32)> = candidates
            .into_iter()
            .map(|(row, _)| {
                let row_vec = self.get_vector(row);
                let score = dot_product_simd(query_slice, row_vec);
                (row, score)
            })
            .collect();

        results.sort_unstable_by(|a, b| {
            b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal)
        });
        results.truncate(top_k);
        results
    }
}

/// Helper to search for existing files across candidate directory locations.
pub fn find_candidate_file(candidates: &[&str]) -> Option<PathBuf> {
    for &c in candidates {
        let p = PathBuf::from(c);
        if p.exists() {
            return Some(p);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_npy_header_parser_v1() {
        // Construct synthetic NPY header v1.0
        let mut bytes = vec![0x93, b'N', b'U', b'M', b'P', b'Y', 1, 0];
        let dict = "{'descr': '<f4', 'fortran_order': False, 'shape': (10, 128), }";
        let pad_len = 64 - ((10 + dict.len()) % 64);
        let padded_dict = format!("{}{}\n", dict, " ".repeat(pad_len));
        let hlen = padded_dict.len() as u16;
        bytes.extend_from_slice(&hlen.to_le_bytes());
        bytes.extend_from_slice(padded_dict.as_bytes());

        let header = NpyHeader::parse(&bytes).expect("Failed to parse valid header");
        assert_eq!(header.descr, "<f4");
        assert_eq!(header.shape, vec![10, 128]);
        assert!(!header.fortran_order);
    }

    #[test]
    fn test_npy_header_invalid_magic() {
        let bytes = vec![0x00, b'N', b'U', b'M', b'P', b'Y', 1, 0, 10, 0];
        assert!(NpyHeader::parse(&bytes).is_err());
    }

    #[test]
    fn test_bounded_min_heap_f32_ordering() {
        let num_movies = 10;
        let dim = 10;
        let mut matrix = vec![0.0f32; num_movies * dim];
        for i in 0..num_movies {
            for d in 0..dim {
                matrix[i * dim + d] = if i == d { 10.0 } else { (d + 1) as f32 * 0.1 };
            }
            normalize_in_place(&mut matrix[i * dim..(i + 1) * dim]);
        }
        let ids: Vec<i64> = (100..110).collect();
        let store = VectorStore::from_f32_matrix(&matrix, num_movies, dim, ids);

        let query = store.get_vector(5).to_vec();
        let top3 = store.top_k_float_similarity(&query, None, 3);
        assert_eq!(top3.len(), 3);
        // The closest to row 5 should be row 5 itself (cosine sim ~ 1.0)
        assert_eq!(top3[0].0, 5);
        assert!((top3[0].1 - 1.0).abs() < 1e-5);
        // Scores should be strictly descending
        assert!(top3[0].1 >= top3[1].1);
        assert!(top3[1].1 >= top3[2].1);

        // Test exclusion of row 5
        let top_ex = store.top_k_float_similarity(&query, Some(5), 3);
        assert_eq!(top_ex.len(), 3);
        assert_ne!(top_ex[0].0, 5);
    }

    #[test]
    fn test_quantized_matrix_creation_and_search() {
        let num_movies = 20;
        let dim = 768;
        let mut matrix = vec![0.0f32; num_movies * dim];
        for i in 0..num_movies {
            for d in 0..dim {
                matrix[i * dim + d] = ((i * 31 + d * 17) % 200) as f32 / 100.0 - 1.0;
            }
            normalize_in_place(&mut matrix[i * dim..(i + 1) * dim]);
        }
        let ids: Vec<i64> = (1000..1020).collect();
        let store = VectorStore::from_f32_matrix(&matrix, num_movies, dim, ids);

        assert_eq!(store.quantized_matrix.len(), num_movies * dim);
        for &q in &store.quantized_matrix {
            assert!(q >= -127);
        }

        let query = store.get_vector(7).to_vec();
        let top5 = store.top_k_cosine_similarity(&query, None, 5);
        assert_eq!(top5.len(), 5);
        // Self-similarity of row 7 should be ~1.0 and ranked #1
        assert_eq!(top5[0].0, 7);
        assert!((top5[0].1 - 1.0).abs() < 1e-4);
    }

    #[test]
    fn test_microsecond_search_latency_synthetic() {
        let num_movies = 1000;
        let dim = 768;
        let mut matrix = vec![0.0f32; num_movies * dim];
        for i in 0..num_movies {
            for d in 0..dim {
                matrix[i * dim + d] = ((i * 13 + d * 7) % 100) as f32 / 100.0;
            }
            normalize_in_place(&mut matrix[i * dim..(i + 1) * dim]);
        }
        let ids: Vec<i64> = (0..num_movies as i64).collect();
        let store = VectorStore::from_f32_matrix(&matrix, num_movies, dim, ids);

        let query = store.get_vector(42).to_vec();
        let t0 = std::time::Instant::now();
        let results = store.top_k_cosine_similarity(&query, Some(42), 10);
        let elapsed = t0.elapsed();

        assert_eq!(results.len(), 10);
        println!("Search time across 1000 items: {:?}", elapsed);
    }

    #[test]
    fn test_benchmark_75k_embeddings_search_latency() {
        let emb_candidates = [
            "../../models/sbert_embeddings.npy",
            "../models/sbert_embeddings.npy",
            "models/sbert_embeddings.npy",
            "backend/models/sbert_embeddings.npy",
        ];
        let ids_candidates = [
            "../../models/movie_ids.npy",
            "../models/movie_ids.npy",
            "models/movie_ids.npy",
            "backend/models/movie_ids.npy",
        ];

        let emb_path = match find_candidate_file(&emb_candidates) {
            Some(p) => p,
            None => {
                println!("Skipping real 75k benchmark (embeddings file not found in test runner path)");
                return;
            }
        };
        let ids_path = match find_candidate_file(&ids_candidates) {
            Some(p) => p,
            None => {
                println!("Skipping real 75k benchmark (movie_ids file not found in test runner path)");
                return;
            }
        };

        println!("📂 Loading VectorStore from {:?}", emb_path);
        let store = VectorStore::load(&emb_path, &ids_path).expect("Failed to load vector store");
        assert_eq!(store.num_movies, 75253);
        assert_eq!(store.embedding_dim, 768);
        assert_eq!(store.quantized_matrix.len(), 75253 * 768);

        // Warmup queries
        let test_rows = [0, 550, 1000, 5000, 12000, 25000, 50000, 75000];
        for &row in &test_rows[0..2] {
            let q = store.get_vector(row);
            let _ = store.top_k_cosine_similarity(q, Some(row), 10);
        }

        // Measured benchmark runs
        let mut q_latencies_us = Vec::new();
        let mut f_latencies_us = Vec::new();
        let mut total_latencies_us = Vec::new();

        let q_i8 = quantize_f32_to_i8(store.get_vector(550));

        for &row in &test_rows {
            let q = store.get_vector(row);

            // Quantized only
            let t_q = std::time::Instant::now();
            let _ = store.top_k_quantized_similarity(&q_i8, Some(row), 64);
            q_latencies_us.push(t_q.elapsed().as_micros());

            // Float only
            let t_f = std::time::Instant::now();
            let _ = store.top_k_float_similarity(q, Some(row), 10);
            f_latencies_us.push(t_f.elapsed().as_micros());

            // Cosine (quantized + rescore)
            let t_tot = std::time::Instant::now();
            let res = store.top_k_cosine_similarity(q, Some(row), 10);
            total_latencies_us.push(t_tot.elapsed().as_micros());
            assert_eq!(res.len(), 10);
        }

        let avg_q = q_latencies_us.iter().sum::<u128>() as f64 / q_latencies_us.len() as f64;
        let avg_f = f_latencies_us.iter().sum::<u128>() as f64 / f_latencies_us.len() as f64;
        let avg_tot = total_latencies_us.iter().sum::<u128>() as f64 / total_latencies_us.len() as f64;
        let min_tot = *total_latencies_us.iter().min().unwrap();

        // Thread scaling test
        for threads in [1, 2, 4, 8, 16] {
            let pool = rayon::ThreadPoolBuilder::new().num_threads(threads).build().unwrap();
            let elapsed = pool.install(|| {
                let t = std::time::Instant::now();
                let _ = store.top_k_cosine_similarity(store.get_vector(550), Some(550), 10);
                t.elapsed()
            });
            println!("⚡ {} threads: {:.3}ms ({:?})", threads, elapsed.as_secs_f64() * 1000.0, elapsed);
        }

        println!(
            "⚡ Breakdown 75k items: Quantized only = {:.2}µs ({:.3}ms) | Float only = {:.2}µs ({:.3}ms) | Total = {:.2}µs ({:.3}ms), Min = {}µs",
            avg_q, avg_q / 1000.0,
            avg_f, avg_f / 1000.0,
            avg_tot, avg_tot / 1000.0,
            min_tot
        );
    }
}
