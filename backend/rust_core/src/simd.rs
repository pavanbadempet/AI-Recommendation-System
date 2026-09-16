//! High-performance SIMD & parallel vector similarity kernels.

/// Portable fallback calculating the dot product of two f32 slices
/// using 8-way loop unrolling for LLVM auto-vectorization.
#[allow(dead_code)]
#[inline(always)]
pub fn dot_product_f32_portable(a: &[f32], b: &[f32]) -> f32 {
    let mut sum0 = 0.0f32;
    let mut sum1 = 0.0f32;
    let mut sum2 = 0.0f32;
    let mut sum3 = 0.0f32;
    let mut sum4 = 0.0f32;
    let mut sum5 = 0.0f32;
    let mut sum6 = 0.0f32;
    let mut sum7 = 0.0f32;

    let chunks_a = a.chunks_exact(8);
    let chunks_b = b.chunks_exact(8);
    let rem_a = chunks_a.remainder();
    let rem_b = chunks_b.remainder();

    for (ca, cb) in chunks_a.zip(chunks_b) {
        sum0 += ca[0] * cb[0];
        sum1 += ca[1] * cb[1];
        sum2 += ca[2] * cb[2];
        sum3 += ca[3] * cb[3];
        sum4 += ca[4] * cb[4];
        sum5 += ca[5] * cb[5];
        sum6 += ca[6] * cb[6];
        sum7 += ca[7] * cb[7];
    }

    let mut total = (sum0 + sum1) + (sum2 + sum3) + (sum4 + sum5) + (sum6 + sum7);
    for (&x, &y) in rem_a.iter().zip(rem_b.iter()) {
        total += x * y;
    }
    total
}

/// AVX2 + FMA accelerated f32 dot product kernel unrolled 32 floats per iteration.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2", enable = "fma")]
pub unsafe fn dot_product_f32_avx2(a: &[f32], b: &[f32]) -> f32 {
    use std::arch::x86_64::*;

    let len = a.len().min(b.len());
    let mut ptr_a = a.as_ptr();
    let mut ptr_b = b.as_ptr();

    let mut acc0 = _mm256_setzero_ps();
    let mut acc1 = _mm256_setzero_ps();
    let mut acc2 = _mm256_setzero_ps();
    let mut acc3 = _mm256_setzero_ps();

    let chunks32 = len / 32;
    for _ in 0..chunks32 {
        let va0 = _mm256_loadu_ps(ptr_a);
        let vb0 = _mm256_loadu_ps(ptr_b);
        acc0 = _mm256_fmadd_ps(va0, vb0, acc0);

        let va1 = _mm256_loadu_ps(ptr_a.add(8));
        let vb1 = _mm256_loadu_ps(ptr_b.add(8));
        acc1 = _mm256_fmadd_ps(va1, vb1, acc1);

        let va2 = _mm256_loadu_ps(ptr_a.add(16));
        let vb2 = _mm256_loadu_ps(ptr_b.add(16));
        acc2 = _mm256_fmadd_ps(va2, vb2, acc2);

        let va3 = _mm256_loadu_ps(ptr_a.add(24));
        let vb3 = _mm256_loadu_ps(ptr_b.add(24));
        acc3 = _mm256_fmadd_ps(va3, vb3, acc3);

        ptr_a = ptr_a.add(32);
        ptr_b = ptr_b.add(32);
    }

    acc0 = _mm256_add_ps(acc0, acc1);
    acc2 = _mm256_add_ps(acc2, acc3);
    acc0 = _mm256_add_ps(acc0, acc2);

    let hi128 = _mm256_extractf128_ps(acc0, 1);
    let lo128 = _mm256_castps256_ps128(acc0);
    let sum128 = _mm_add_ps(lo128, hi128);
    let shuf = _mm_movehdup_ps(sum128);
    let sums = _mm_add_ps(sum128, shuf);
    let hi64 = _mm_movehl_ps(sums, sums);
    let final_sum = _mm_add_ss(sums, hi64);
    let mut total = _mm_cvtss_f32(final_sum);

    let offset = chunks32 * 32;
    for i in offset..len {
        total += *a.get_unchecked(i) * *b.get_unchecked(i);
    }

    total
}

/// Calculates the dot product of two f32 slices using AVX2+FMA when available,
/// falling back to the 8-way unrolled portable loop.
#[inline(always)]
pub fn dot_product_simd(a: &[f32], b: &[f32]) -> f32 {
    #[cfg(all(target_arch = "x86_64", target_feature = "avx2", target_feature = "fma"))]
    {
        unsafe { dot_product_f32_avx2(a, b) }
    }
    #[cfg(not(all(target_arch = "x86_64", target_feature = "avx2", target_feature = "fma")))]
    {
        #[cfg(target_arch = "x86_64")]
        {
            if is_x86_feature_detected!("avx2") && is_x86_feature_detected!("fma") {
                return unsafe { dot_product_f32_avx2(a, b) };
            }
        }
        dot_product_f32_portable(a, b)
    }
}

/// Portable fallback calculating the dot product of two int8 slices
/// using 8-way loop unrolling for LLVM auto-vectorization.
#[allow(dead_code)]
#[inline(always)]
pub fn dot_product_i8_portable(a: &[i8], b: &[i8]) -> i32 {
    let mut sum0 = 0i32;
    let mut sum1 = 0i32;
    let mut sum2 = 0i32;
    let mut sum3 = 0i32;
    let mut sum4 = 0i32;
    let mut sum5 = 0i32;
    let mut sum6 = 0i32;
    let mut sum7 = 0i32;

    let chunks_a = a.chunks_exact(8);
    let chunks_b = b.chunks_exact(8);
    let rem_a = chunks_a.remainder();
    let rem_b = chunks_b.remainder();

    for (ca, cb) in chunks_a.zip(chunks_b) {
        sum0 += (ca[0] as i32) * (cb[0] as i32);
        sum1 += (ca[1] as i32) * (cb[1] as i32);
        sum2 += (ca[2] as i32) * (cb[2] as i32);
        sum3 += (ca[3] as i32) * (cb[3] as i32);
        sum4 += (ca[4] as i32) * (cb[4] as i32);
        sum5 += (ca[5] as i32) * (cb[5] as i32);
        sum6 += (ca[6] as i32) * (cb[6] as i32);
        sum7 += (ca[7] as i32) * (cb[7] as i32);
    }

    let mut total = (sum0 + sum1) + (sum2 + sum3) + (sum4 + sum5) + (sum6 + sum7);
    for (&x, &y) in rem_a.iter().zip(rem_b.iter()) {
        total += (x as i32) * (y as i32);
    }
    total
}

/// AVX2 accelerated int8 dot product kernel using _mm256_madd_epi16 and sign extension.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
#[allow(dead_code)]
pub unsafe fn dot_product_i8_avx2(a: &[i8], b: &[i8]) -> i32 {
    use std::arch::x86_64::*;

    let len = a.len().min(b.len());
    let mut ptr_a = a.as_ptr();
    let mut ptr_b = b.as_ptr();

    let mut acc0 = _mm256_setzero_si256();
    let mut acc1 = _mm256_setzero_si256();

    let chunks64 = len / 64;
    for _ in 0..chunks64 {
        // First 32 bytes
        let va0 = _mm256_loadu_si256(ptr_a as *const __m256i);
        let vb0 = _mm256_loadu_si256(ptr_b as *const __m256i);

        let va0_lo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(va0));
        let vb0_lo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(vb0));
        let va0_hi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(va0, 1));
        let vb0_hi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(vb0, 1));

        acc0 = _mm256_add_epi32(acc0, _mm256_madd_epi16(va0_lo, vb0_lo));
        acc0 = _mm256_add_epi32(acc0, _mm256_madd_epi16(va0_hi, vb0_hi));

        // Second 32 bytes
        let va1 = _mm256_loadu_si256(ptr_a.add(32) as *const __m256i);
        let vb1 = _mm256_loadu_si256(ptr_b.add(32) as *const __m256i);

        let va1_lo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(va1));
        let vb1_lo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(vb1));
        let va1_hi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(va1, 1));
        let vb1_hi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(vb1, 1));

        acc1 = _mm256_add_epi32(acc1, _mm256_madd_epi16(va1_lo, vb1_lo));
        acc1 = _mm256_add_epi32(acc1, _mm256_madd_epi16(va1_hi, vb1_hi));

        ptr_a = ptr_a.add(64);
        ptr_b = ptr_b.add(64);
    }

    let mut total_acc = _mm256_add_epi32(acc0, acc1);

    let rem_bytes = len - (chunks64 * 64);
    let chunks32 = rem_bytes / 32;
    if chunks32 > 0 {
        let va = _mm256_loadu_si256(ptr_a as *const __m256i);
        let vb = _mm256_loadu_si256(ptr_b as *const __m256i);

        let va_lo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(va));
        let vb_lo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(vb));
        let va_hi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(va, 1));
        let vb_hi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(vb, 1));

        total_acc = _mm256_add_epi32(total_acc, _mm256_madd_epi16(va_lo, vb_lo));
        total_acc = _mm256_add_epi32(total_acc, _mm256_madd_epi16(va_hi, vb_hi));
    }

    // Horizontal sum of total_acc (8 x i32)
    let hi128 = _mm256_extracti128_si256(total_acc, 1);
    let lo128 = _mm256_castsi256_si128(total_acc);
    let sum128 = _mm_add_epi32(lo128, hi128);

    let hi64 = _mm_unpackhi_epi64(sum128, sum128);
    let sum64 = _mm_add_epi32(sum128, hi64);

    let hi32 = _mm_shuffle_epi32(sum64, 1);
    let sum32 = _mm_add_epi32(sum64, hi32);
    let mut total = _mm_cvtsi128_si32(sum32);

    let processed = (chunks64 * 64) + (chunks32 * 32);
    for i in processed..len {
        total += (*a.get_unchecked(i) as i32) * (*b.get_unchecked(i) as i32);
    }

    total
}

/// Calculates the dot product of two int8 slices using AVX2 when available,
/// falling back to the 8-way unrolled portable loop.
#[inline(always)]
#[allow(dead_code)]
pub fn dot_product_i8_simd(a: &[i8], b: &[i8]) -> i32 {
    #[cfg(all(target_arch = "x86_64", target_feature = "avx2"))]
    {
        unsafe { dot_product_i8_avx2(a, b) }
    }
    #[cfg(not(all(target_arch = "x86_64", target_feature = "avx2")))]
    {
        #[cfg(target_arch = "x86_64")]
        {
            if is_x86_feature_detected!("avx2") {
                return unsafe { dot_product_i8_avx2(a, b) };
            }
        }
        dot_product_i8_portable(a, b)
    }
}

/// AVX2 accelerated int8 dot product where the query vector has been pre-unpacked
/// into i16 elements. Avoids unpacking the query on every row.
#[cfg(target_arch = "x86_64")]
#[target_feature(enable = "avx2")]
pub unsafe fn dot_product_i8_precomputed_avx2(query_i16: &[i16], row_i8: &[i8]) -> i32 {
    use std::arch::x86_64::*;

    let len = query_i16.len().min(row_i8.len());
    let mut ptr_q = query_i16.as_ptr();
    let mut ptr_b = row_i8.as_ptr();

    let mut acc0 = _mm256_setzero_si256();
    let mut acc1 = _mm256_setzero_si256();
    let mut acc2 = _mm256_setzero_si256();
    let mut acc3 = _mm256_setzero_si256();

    let chunks64 = len / 64;
    for _ in 0..chunks64 {
        // First 32 elements: load 32 bytes from candidate row
        let vb0 = _mm256_loadu_si256(ptr_b as *const __m256i);
        let vb0_lo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(vb0));
        let vb0_hi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(vb0, 1));

        let vq0_lo = _mm256_loadu_si256(ptr_q as *const __m256i);
        let vq0_hi = _mm256_loadu_si256(ptr_q.add(16) as *const __m256i);

        acc0 = _mm256_add_epi32(acc0, _mm256_madd_epi16(vq0_lo, vb0_lo));
        acc1 = _mm256_add_epi32(acc1, _mm256_madd_epi16(vq0_hi, vb0_hi));

        // Second 32 elements: load next 32 bytes from candidate row
        let vb1 = _mm256_loadu_si256(ptr_b.add(32) as *const __m256i);
        let vb1_lo = _mm256_cvtepi8_epi16(_mm256_castsi256_si128(vb1));
        let vb1_hi = _mm256_cvtepi8_epi16(_mm256_extracti128_si256(vb1, 1));

        let vq1_lo = _mm256_loadu_si256(ptr_q.add(32) as *const __m256i);
        let vq1_hi = _mm256_loadu_si256(ptr_q.add(48) as *const __m256i);

        acc2 = _mm256_add_epi32(acc2, _mm256_madd_epi16(vq1_lo, vb1_lo));
        acc3 = _mm256_add_epi32(acc3, _mm256_madd_epi16(vq1_hi, vb1_hi));

        ptr_q = ptr_q.add(64);
        ptr_b = ptr_b.add(64);
    }

    acc0 = _mm256_add_epi32(acc0, acc1);
    acc2 = _mm256_add_epi32(acc2, acc3);
    let total_acc = _mm256_add_epi32(acc0, acc2);

    let hi128 = _mm256_extracti128_si256(total_acc, 1);
    let lo128 = _mm256_castsi256_si128(total_acc);
    let sum128 = _mm_add_epi32(lo128, hi128);

    let hi64 = _mm_unpackhi_epi64(sum128, sum128);
    let sum64 = _mm_add_epi32(sum128, hi64);

    let hi32 = _mm_shuffle_epi32(sum64, 1);
    let sum32 = _mm_add_epi32(sum64, hi32);
    let mut total = _mm_cvtsi128_si32(sum32);

    let offset = chunks64 * 64;
    for i in offset..len {
        total += (*query_i16.get_unchecked(i) as i32) * (*row_i8.get_unchecked(i) as i32);
    }

    total
}

/// Portable fallback calculating the dot product between precomputed i16 query and i8 row.
#[allow(dead_code)]
#[inline(always)]
pub fn dot_product_i8_precomputed_portable(query_i16: &[i16], row_i8: &[i8]) -> i32 {
    let mut sum0 = 0i32;
    let mut sum1 = 0i32;
    let mut sum2 = 0i32;
    let mut sum3 = 0i32;
    let mut sum4 = 0i32;
    let mut sum5 = 0i32;
    let mut sum6 = 0i32;
    let mut sum7 = 0i32;

    let chunks_q = query_i16.chunks_exact(8);
    let chunks_b = row_i8.chunks_exact(8);
    let rem_q = chunks_q.remainder();
    let rem_b = chunks_b.remainder();

    for (cq, cb) in chunks_q.zip(chunks_b) {
        sum0 += (cq[0] as i32) * (cb[0] as i32);
        sum1 += (cq[1] as i32) * (cb[1] as i32);
        sum2 += (cq[2] as i32) * (cb[2] as i32);
        sum3 += (cq[3] as i32) * (cb[3] as i32);
        sum4 += (cq[4] as i32) * (cb[4] as i32);
        sum5 += (cq[5] as i32) * (cb[5] as i32);
        sum6 += (cq[6] as i32) * (cb[6] as i32);
        sum7 += (cq[7] as i32) * (cb[7] as i32);
    }

    let mut total = (sum0 + sum1) + (sum2 + sum3) + (sum4 + sum5) + (sum6 + sum7);
    for (&x, &y) in rem_q.iter().zip(rem_b.iter()) {
        total += (x as i32) * (y as i32);
    }
    total
}

/// High-throughput dot product using AVX2 with pre-unpacked i16 query vector.
#[inline(always)]
pub fn dot_product_i8_precomputed_simd(query_i16: &[i16], row_i8: &[i8]) -> i32 {
    #[cfg(all(target_arch = "x86_64", target_feature = "avx2"))]
    {
        unsafe { dot_product_i8_precomputed_avx2(query_i16, row_i8) }
    }
    #[cfg(not(all(target_arch = "x86_64", target_feature = "avx2")))]
    {
        #[cfg(target_arch = "x86_64")]
        {
            if is_x86_feature_detected!("avx2") {
                return unsafe { dot_product_i8_precomputed_avx2(query_i16, row_i8) };
            }
        }
        dot_product_i8_precomputed_portable(query_i16, row_i8)
    }
}

/// Quantizes an f32 vector into an 8-bit symmetrically quantized i8 vector:
/// q = clamp(round(v * 127.0), -127, 127).
#[inline(always)]
pub fn quantize_f32_to_i8(vec: &[f32]) -> Vec<i8> {
    let mut out = Vec::with_capacity(vec.len());
    for &val in vec {
        let scaled = (val * 127.0).round();
        let clamped = if scaled < -127.0 {
            -127i8
        } else if scaled > 127.0 {
            127i8
        } else {
            scaled as i8
        };
        out.push(clamped);
    }
    out
}

/// Computes the L2 norm of a vector.
#[inline(always)]
pub fn l2_norm(vec: &[f32]) -> f32 {
    let dot = dot_product_simd(vec, vec);
    dot.sqrt()
}

/// Normalizes a vector in-place to unit length (L2 norm = 1.0).
#[inline(always)]
pub fn normalize_in_place(vec: &mut [f32]) {
    let norm = l2_norm(vec);
    if norm > 1e-12 {
        let inv_norm = 1.0 / norm;
        for val in vec.iter_mut() {
            *val *= inv_norm;
        }
    }
}

/// Computes the cosine similarity between two arbitrary vectors.
#[allow(dead_code)]
#[inline(always)]
pub fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    let dot = dot_product_simd(a, b);
    let norm_a = l2_norm(a);
    let norm_b = l2_norm(b);
    if norm_a == 0.0 || norm_b == 0.0 {
        0.0
    } else {
        dot / (norm_a * norm_b)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dot_product_simd() {
        let a = vec![1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0];
        let b = vec![2.0, 1.0, 0.0, 1.0, 2.0, 1.0, 0.0, 1.0, 2.0];
        let dot = dot_product_simd(&a, &b);
        let expected = 2.0 + 2.0 + 0.0 + 4.0 + 10.0 + 6.0 + 0.0 + 8.0 + 18.0;
        assert!((dot - expected).abs() < 1e-5);
    }

    #[test]
    fn test_dot_product_simd_long() {
        // 768 elements to match embedding dimension
        let a: Vec<f32> = (0..768).map(|i| (i % 10) as f32 * 0.1).collect();
        let b: Vec<f32> = (0..768).map(|i| ((i + 3) % 10) as f32 * 0.1).collect();
        let portable = dot_product_f32_portable(&a, &b);
        let simd = dot_product_simd(&a, &b);
        assert!((portable - simd).abs() < 1e-3, "Mismatch: portable={}, simd={}", portable, simd);
    }

    #[test]
    fn test_dot_product_i8_simd() {
        let a: Vec<i8> = vec![1, 2, -3, 4, -5, 6, 7, -8, 9, 10, -11, 12];
        let b: Vec<i8> = vec![2, -1, 0, 1, 2, -1, 0, 1, 2, -2, 3, 1];
        let portable = dot_product_i8_portable(&a, &b);
        let simd = dot_product_i8_simd(&a, &b);
        assert_eq!(portable, simd);

        let mut expected = 0i32;
        for (&x, &y) in a.iter().zip(b.iter()) {
            expected += (x as i32) * (y as i32);
        }
        assert_eq!(simd, expected);
    }

    #[test]
    fn test_dot_product_i8_768_dim() {
        let a: Vec<i8> = (0..768).map(|i| (((i * 7) % 255) as i16 - 127) as i8).collect();
        let b: Vec<i8> = (0..768).map(|i| (((i * 13) % 255) as i16 - 127) as i8).collect();
        let portable = dot_product_i8_portable(&a, &b);
        let simd = dot_product_i8_simd(&a, &b);
        assert_eq!(portable, simd, "Int8 AVX2 and portable mismatch on 768 dim");
    }

    #[test]
    fn test_quantize_f32_to_i8() {
        let f = vec![0.0, 1.0, -1.0, 0.5, -0.5, 1.5, -1.5];
        let q = quantize_f32_to_i8(&f);
        assert_eq!(q[0], 0);
        assert_eq!(q[1], 127);
        assert_eq!(q[2], -127);
        assert_eq!(q[3], 64);
        assert_eq!(q[4], -64);
        assert_eq!(q[5], 127);
        assert_eq!(q[6], -127);
    }

    #[test]
    fn test_check_target_features() {
        println!("cfg avx2: {}", cfg!(target_feature = "avx2"));
        println!("cfg fma: {}", cfg!(target_feature = "fma"));
        #[cfg(target_arch = "x86_64")]
        {
            println!("runtime avx2: {}", is_x86_feature_detected!("avx2"));
            println!("runtime fma: {}", is_x86_feature_detected!("fma"));
        }
    }

    #[test]
    fn test_normalize_in_place() {
        let mut v = vec![3.0, 4.0];
        normalize_in_place(&mut v);
        assert!((l2_norm(&v) - 1.0).abs() < 1e-6);
        assert!((v[0] - 0.6).abs() < 1e-6);
        assert!((v[1] - 0.8).abs() < 1e-6);
    }
}

