# Imagen de producción: compila el frontend y corre el backend (que sirve el frontend + la API + el bot de WhatsApp).
FROM node:22-slim

WORKDIR /app
RUN corepack enable

# Dependencias (con caché de capas)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Código y build del frontend (-> dist/)
COPY . .
RUN pnpm build

ENV NODE_ENV=production
# NO fijamos PORT: Railway lo inyecta en tiempo de ejecución y el server lo lee de process.env.PORT.

CMD ["pnpm", "start"]
