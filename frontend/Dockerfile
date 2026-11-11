# ---- Build the Vite app ----
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
# No VITE_API_URL: the app calls a relative "/api", which nginx proxies to the backend.
RUN npm run build
# Source maps would publish the full original source; keep them out of the served image.
RUN find build -name '*.map' -delete

# ---- Serve with nginx (also proxies /api -> backend) ----
FROM nginx:alpine AS runner
COPY --from=builder /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
