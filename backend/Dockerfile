# PocketBase runs from /pb, so its data, migrations and hooks folders default to
# /pb/pb_data, /pb/pb_migrations and /pb/pb_hooks.
FROM alpine:3.22

ARG POCKETBASE_VERSION=0.40.6
ARG TARGETARCH=amd64

RUN set -e; \
    apk add --no-cache ca-certificates; \
    release="https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}"; \
    zip="pocketbase_${POCKETBASE_VERSION}_linux_${TARGETARCH}.zip"; \
    mkdir -p /pb/pb_data; \
    cd /tmp; \
    wget -q "$release/$zip" "$release/checksums.txt"; \
    grep " $zip\$" checksums.txt | sha256sum -c -; \
    unzip -q "$zip" pocketbase -d /pb; \
    rm -f /tmp/*; \
    adduser -D -u 1000 pocketbase

COPY pb_migrations /pb/pb_migrations
COPY pb_hooks /pb/pb_hooks
RUN chown -R pocketbase:pocketbase /pb

USER pocketbase
WORKDIR /pb
VOLUME /pb/pb_data
EXPOSE 8090
ENTRYPOINT ["/pb/pocketbase"]
