# Gunakan node versi ringan (alpine) untuk menghemat RAM STB
FROM node:18-alpine

# Tentukan direktori kerja di dalam kontainer
WORKDIR /usr/src/app

# Salin file package untuk install dependensi terlebih dahulu (optimasi cache)
COPY package*.json ./

# Install dependensi (hanya production untuk menghemat space)
RUN npm install --production

# Salin semua kode sumber aplikasi
COPY . .

# Expose port yang digunakan aplikasi
EXPOSE 3000

# Jalankan aplikasi
CMD ["npm", "start"]