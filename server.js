require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { sequelize, Concert, Transaction, User } = require('./models');

const app = express();
app.use(express.json());

// Middleware: Verifikasi JWT
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ message: "Token tidak valid" });
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ message: "Silakan login terlebih dahulu" });
  }
};

// --- AUTH ROUTES ---
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashedPassword });
    res.status(201).json({ message: "User berhasil terdaftar", userId: user.id });
  } catch (error) {
    res.status(400).json({ message: "Username sudah digunakan" });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Username atau password salah" });
  }
  const token = jwt.sign({ id: user.id, username: user.username }, process.env.JWT_SECRET, { expiresIn: '24h' });
  res.json({ token });
});

// --- CONCERT ROUTES ---

app.get('/concerts', async (req, res) => {
  const concerts = await Concert.findAll();
  res.json(concerts);
});

// Pembelian Tiket
app.post('/buy', authenticateJWT, async (req, res) => {
  const { concertId, amount } = req.body;
  const userId = req.user.id;

  const t = await sequelize.transaction();
  try {
    const concert = await Concert.findByPk(concertId, { transaction: t, lock: true });

    if (!concert) throw new Error('Konser tidak ditemukan');

    // Validasi Waktu: Maksimal 1 minggu sebelum konser
    const now = new Date();
    const concertDate = new Date(concert.date);
    const deadline = new Date(concertDate.getTime() - (7 * 24 * 60 * 60 * 1000));

    if (now > deadline) {
      throw new Error('Penjualan ditutup. Pembelian harus dilakukan maksimal H-7 konser.');
    }

    // Validasi Stok
    if (concert.stock < amount) throw new Error('Stok tidak mencukupi');

    // Hitung Total Harga
    const total = concert.price * amount;

    // Update Stok & Simpan Transaksi
    concert.stock -= amount;
    await concert.save({ transaction: t });

    const order = await Transaction.create({
      amount: amount,
      totalPrice: total,
      userId: userId,
      concertId: concertId
    }, { transaction: t });

    await t.commit();
    res.json({ message: "Pembelian berhasil!", order });

  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
});

// --- ENDPOINT: LIHAT HISTORY PESANAN USER ---
app.get('/my-orders', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    // Mencari semua transaksi milik user yang sedang login
    const orders = await Transaction.findAll({
      where: { userId: userId },
      include: [
        {
          model: Concert,
          attributes: ['name', 'venue', 'date', 'price'] // Hanya ambil kolom yang penting
        }
      ],
      order: [['createdAt', 'DESC']] // Urutkan dari yang terbaru
    });

    if (orders.length === 0) {
      return res.json({ message: "Anda belum memiliki riwayat pemesanan." });
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;

sequelize.sync().then(async () => {
  console.log('Database terhubung.');

  if (await Concert.count() === 0) {
    await Concert.bulkCreate([
      { 
        name: 'POISONYA SYNDROME', 
        price: 50, 
        stock: 3000, 
        venue: 'Tachikawa Stage Garden', 
        date: new Date('2026-11-15 20:00:00') 
      },
      { 
        name: "Ahoy!! You're All Pirates", 
        price: 70, 
        stock: 20000, 
        venue: 'K-Arena', 
        date: new Date('2026-02-10 19:00:00') 
      }
    ]);
  }

  if (await User.count() === 0) {
      const hashedPassword = await bcrypt.hash('nyannyan', 10);
      await User.create({
        username: 'nekomata_okayu',
        password: hashedPassword,
        role: 'customer'
      });
      console.log('User nekomata_okayu berhasil dibuat!');
    }

  app.listen(PORT, () => console.log(`Server aktif di port ${PORT}`));
});