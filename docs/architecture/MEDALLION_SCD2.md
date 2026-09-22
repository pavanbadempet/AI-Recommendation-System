# Delta Lake Medallion Architecture: SCD Type 2 Implementation

## Purpose
Tracking temporal changes in movie metadata (genres, director credits, production studios) and user preference profiles using Slowly Changing Dimension Type 2 (SCD2) history preservation.

## Key Design Rules
- Active Record Flag: `is_current = True`, `valid_to = '9999-12-31'`
- Expired Record Flag: `is_current = False`, `valid_to = current_timestamp()`
- Deterministic Hashing: SHA-256 row-hash over mutable attribute columns to detect attribute drift during micro-batch merges.
