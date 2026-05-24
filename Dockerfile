# Usar la imagen oficial slim de Node.js v20 como base (Debian-based)
FROM node:20-slim

# Instalar SWI-Prolog y limpiar la caché de apt para reducir tamaño del contenedor
RUN apt-get update && \
    apt-get install -y --no-install-recommends swi-prolog && \
    rm -rf /var/lib/apt/lists/*

# Establecer el directorio de trabajo del contenedor
WORKDIR /usr/src/app

# Copiar archivos de definición de dependencias
COPY package*.json ./

# Instalar dependencias de producción únicamente
RUN npm install --only=production

# Copiar el código fuente del proyecto
COPY . .

# Exponer el puerto por defecto (3000)
EXPOSE 3000

# Comando para iniciar la aplicación Node.js
CMD [ "node", "server.js" ]
