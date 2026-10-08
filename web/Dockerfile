
# ==========================================
# CRM CARE - SECURE NODE.JS DOCKERFILE
# ==========================================

FROM node:22-alpine

# Thư mục làm việc
WORKDIR /app

# Cài đặt thư viện trước để tận dụng Docker cache
COPY package*.json ./

# Cài dependencies dành cho môi trường production
RUN npm install --omit=dev --no-audit --no-fund \
    && npm cache clean --force

# Sao chép mã nguồn và giao quyền sở hữu cho node
COPY --chown=node:node . .

# Chạy bằng user không phải root
USER node

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server.js"]
