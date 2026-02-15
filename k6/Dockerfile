# Dockerfile for K6 with Effection support
#
# This builds a custom K6 binary that includes the Sobek yield-in-finally fix
# required for Effection's structured concurrency cleanup semantics.
#
# Prerequisites:
#   Run `node build.js` in the k6 directory to build the JS bundles first.
#
# Multi-stage build:
#   1. Build custom K6 with patched Sobek
#   2. Alpine runtime with custom K6 + pre-built JS bundles

# =============================================================================
# Stage 1: Build custom K6 with Sobek fix
# =============================================================================
FROM golang:1.24-alpine AS k6-builder

WORKDIR /build

# Install git for cloning
RUN apk add --no-cache git

# Clone K6 source
RUN git clone --depth 1 https://github.com/grafana/k6.git .

# Add replace directive to use our fixed Sobek fork
# This fixes: https://github.com/grafana/sobek/issues/114
RUN echo 'replace github.com/grafana/sobek => github.com/taras/sobek v0.0.0-20260215012414-013550b38489' >> go.mod

# Build K6 with the patched Sobek
RUN go mod tidy && go build -mod=mod -o k6 ./

# =============================================================================
# Stage 2: Runtime image with custom K6
# =============================================================================
FROM alpine:latest

# Install ca-certificates for HTTPS requests
RUN apk add --no-cache ca-certificates

# Copy custom K6 binary
COPY --from=k6-builder /build/k6 /usr/local/bin/k6

# Copy pre-built bundles (must run `node build.js` first)
COPY dist /tests

# Set working directory
WORKDIR /tests

# Default entrypoint
ENTRYPOINT ["k6", "run"]

# Default command runs conformance tests
CMD ["conformance-bundle.js"]
