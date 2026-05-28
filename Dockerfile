# Use Node.js 20 (required by Baileys)
FROM node:20-slim

# Install dependencies including python alias
RUN apt-get update && apt-get install -y \
    python3 \
    python-is-python3 \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Start the bot
CMD ["node", "media.js"]
