# Base Image com Node.js e Python 3 + FFmpeg
FROM node:20-slim

# Instalar Python3, pip, ffmpeg e dependências do sistema
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Instalar yt-dlp globalmente e dependências python
COPY requirements.txt ./
RUN pip3 install --no-cache-dir -r requirements.txt --break-system-packages || pip3 install --no-cache-dir -r requirements.txt

# Copiar dependências do Next.js
COPY package*.json ./
RUN npm ci || npm install

# Copiar todo o código-fonte do projeto
COPY . .

# Fazer o build da aplicação Next.js
RUN npm run build

EXPOSE 3000

ENV PORT 3000
ENV NODE_ENV production

# Iniciar a aplicação
CMD ["npm", "start"]
