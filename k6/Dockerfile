# Dockerfile for K6 with Effection support
#
# This builds a custom K6 binary that includes the Sobek yield-in-finally fix
# required for Effection's structured concurrency cleanup semantics.
#
# Multi-stage build:
#   1. Build custom K6 with patched Sobek
#   2. Build JS bundle (conformance tests, demos, library)
#   3. Alpine runtime with custom K6

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
RUN echo 'replace github.com/grafana/sobek => github.com/taras/sobek v0.0.0-20260214233038-2ff728dfa619' >> go.mod

# Build K6 with the patched Sobek
RUN go mod tidy && go build -mod=mod -o k6 ./

# =============================================================================
# Stage 2: Build JS bundles
# =============================================================================
FROM node:22-alpine AS js-builder

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install pnpm and dependencies
RUN corepack enable && corepack prepare pnpm@latest --activate
RUN npm install

# Copy source files
COPY . .

# Build all bundles (conformance, library, demos)
RUN pnpm run build:bundle

# =============================================================================
# Stage 3: Runtime image with custom K6
# =============================================================================
FROM alpine:latest

# Install ca-certificates for HTTPS requests
RUN apk add --no-cache ca-certificates

# Copy custom K6 binary
COPY --from=k6-builder /build/k6 /usr/local/bin/k6

# Copy built bundles
COPY --from=js-builder /app/dist /tests

# Set working directory
WORKDIR /tests

# Default entrypoint
ENTRYPOINT ["k6", "run"]

# Default command runs conformance tests
CMD ["conformance-bundle.js"]
