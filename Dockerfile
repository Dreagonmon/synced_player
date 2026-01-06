FROM denoland/deno:distroless-2.6.4 AS build_static

WORKDIR /app
USER root

# install deps
COPY ./deno.jsonc ./deno.jsonc
RUN ["deno", "install"]

# copy source
COPY ./src ./src
COPY ./static ./static

# ==============================================================================
# the runtime

EXPOSE 8000
CMD ["serve", "--allow-read=./static", "--port", "8000", "./src/api.ts"]
