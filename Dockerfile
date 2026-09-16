FROM node:26

# Installa la CLI globale per far funzionare i comandi exec
RUN npm install -g gmgn-cli

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Hugging Face Spaces richiede la porta 7860
EXPOSE 7860

# Ora "run" e "dev" sono separati correttamente
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "7860"]
