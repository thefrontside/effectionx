# syntax=docker/dockerfile:1.7
# Dockerfile for K6 with Effection support
#
# Builds a custom K6 binary with patched Sobek for Effection's
# structured concurrency cleanup semantics.
#
# Prerequisites:
#   Run `node build.js` in the k6 directory to build the JS bundles first.

# =============================================================================
# Stage 1: Build custom K6 with Sobek fix
# =============================================================================
FROM golang:1.24.13-alpine AS k6-builder

ARG K6_REF=v0.57.0
ARG SOBEK_VERSION=v0.0.0-20260215012414-013550b38489

WORKDIR /src

RUN apk add --no-cache git ca-certificates

RUN git clone --depth 1 --branch "${K6_REF}" https://github.com/grafana/k6.git .

RUN go mod edit -replace=github.com/grafana/sobek=github.com/taras/sobek@${SOBEK_VERSION}

RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go mod download && \
    CGO_ENABLED=0 go build -mod=mod -trimpath -ldflags="-s -w" -o /out/k6 ./

# =============================================================================
# Stage 2: Runtime image
# =============================================================================
FROM alpine:3.20

# Install ca-certificates and create non-root user
RUN apk add --no-cache ca-certificates \
    && addgroup -S k6 \
    && adduser -S k6 -G k6

# Copy custom K6 binary
COPY --from=k6-builder /out/k6 /usr/local/bin/k6

# Copy pre-built test bundles (must run `node build.js` first)
COPY --chown=k6:k6 dist /tests

WORKDIR /tests
USER k6

ENTRYPOINT ["k6", "run"]
CMD ["tests/group-context.test.js"]
