# ==============================================================================
# Multi-stage Distroless Dockerfile for Movie Recommendation System
# Pure Rust Axum Serving Backend + Bun 1.2 React SPA Client
#
# Stage 1: Build React 19 SPA static bundle using Bun 1.2 (oven/bun:1.2-alpine)
# Stage 2: Compile static pure-Rust APEX server (rust:1.80-alpine + musl)
# Stage 3: Ultra-lean runtime (gcr.io/distroless/static-debian12:nonroot)
# Target Image Size: < 25 MB | Container Cold-Start: < 50 ms
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Frontend Builder (Bun 1.2 / Alpine)
# ------------------------------------------------------------------------------
FROM oven/bun:1.2-alpine AS frontend_builder

WORKDIR /frontend

# Copy package manifests for cached dependency installation
COPY frontend/package.json frontend/bun.lock* ./

# Install dependencies deterministically with fallback
RUN bun install --frozen-lockfile || bun install

# Copy frontend source code and compile production SPA bundle
COPY frontend/ ./
ENV VITE_BASE_PATH=/
RUN bun run build

# ------------------------------------------------------------------------------
# Stage 2: Rust Static Server Builder (Rust 1.80 / Alpine + musl)
# ------------------------------------------------------------------------------
FROM rust:1.80-alpine AS rust_builder

WORKDIR /build

# Install musl development headers and CA certificates
# hadolint ignore=DL3018
RUN apk add --no-cache musl-dev ca-certificates

# Copy Rust backend source code and workspace manifests
COPY backend/rust_core ./backend/rust_core

# Add musl target, build optimized release binary, and strip symbols
WORKDIR /build/backend/rust_core
RUN rustup target add x86_64-unknown-linux-musl && \
    cargo build --target x86_64-unknown-linux-musl --release --bin apex_server && \
    strip target/x86_64-unknown-linux-musl/release/apex_server

# ------------------------------------------------------------------------------
# Stage 3: Ultra-lean Distroless Static Runtime
# ------------------------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot AS runtime

WORKDIR /app

# Copy system CA certificates from rust builder
COPY --from=rust_builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt

# Copy stripped pure-Rust APEX server static binary
COPY --from=rust_builder /build/backend/rust_core/target/x86_64-unknown-linux-musl/release/apex_server /app/apex_server

# Copy pre-compiled React SPA assets
COPY --from=frontend_builder /frontend/dist /app/dist

# Copy pre-computed vector embeddings and movie metadata catalog
COPY models/ /app/models/

# Configure non-root execution (compatible with HF Spaces UID 1000 & distroless nonroot UID 65532)
USER 65532:65532

# Configure runtime environment variables
ENV PORT=7860
ENV STATIC_DIR=/app/dist

# Expose default Hugging Face Spaces port
EXPOSE 7860

# Define container entrypoint
ENTRYPOINT ["/app/apex_server"]
