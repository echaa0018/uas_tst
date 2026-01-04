require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// Import TransactionAddon here
const { sequelize, Concert, Transaction, User, TransactionAddon } = require('./models');

const app = express();
app.use(cors());
app.use(express.json());

// ... (Middleware authenticateJWT stays the same) ...
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

// ... (Auth Routes stay the same) ...
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

app.get('/concerts', async (req, res) => {
  const concerts = await Concert.findAll();
  res.json(concerts);
});

// Pembelian Tiket (UPDATED)
app.post('/buy', authenticateJWT, async (req, res) => {
  // Catch bonusDrink from body
  const { concertId, amount, bonusDrink } = req.body;
  const userId = req.user.id;

  const t = await sequelize.transaction();
  try {
    const concert = await Concert.findByPk(concertId, { transaction: t, lock: true });

    if (!concert) throw new Error('Konser tidak ditemukan');

    const existingTickets = await Transaction.sum('amount', {
      where: {
        userId: userId,
        concertId: concertId
      },
      transaction: t
    });

    const totalOwned = existingTickets || 0;

    if (totalOwned + amount > 2) {
      throw new Error(`Maksimal total tiket per akun untuk satu konser adalah 2.`);
    }

    const now = new Date();
    const concertDate = new Date(concert.date);
    const deadline = new Date(concertDate.getTime() - (7 * 24 * 60 * 60 * 1000));

    if (now > deadline) {
      throw new Error('Penjualan ditutup. Pembelian harus dilakukan maksimal H-7 konser.');
    }

    if (concert.stock < amount) throw new Error('Stok tidak mencukupi');

    const total = concert.price * amount;

    concert.stock -= amount;
    await concert.save({ transaction: t });

    const order = await Transaction.create({
      amount: amount,
      totalPrice: total,
      userId: userId,
      concertId: concertId
    }, { transaction: t });

    // --- NEW LOGIC START ---
    // If bonusDrink string exists (e.g., "Latte, Mocha"), split and save
    if (bonusDrink && typeof bonusDrink === 'string') {
        const drinkList = bonusDrink.split(', '); // Frontend joins with ", "
        
        // Loop and create addon entries
        for (const drinkName of drinkList) {
            await TransactionAddon.create({
                transactionId: order.id,
                item_name: drinkName
            }, { transaction: t });
        }
    }
    // --- NEW LOGIC END ---

    await t.commit();
    res.json({ message: "Pembelian berhasil!", order });

  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
});

// ... (Rest of the file stays the same) ...
app.get('/my-orders', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    // Optional: Include Addons in the history view
    const orders = await Transaction.findAll({
      where: { userId: userId },
      include: [
        {
          model: Concert,
          attributes: ['name', 'artist', 'venue', 'date', 'price']
        },
        {
          model: TransactionAddon, // Include addons data
          attributes: ['item_name']
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    if (orders.length === 0) {
      return res.json({ message: "Anda belum memiliki riwayat pemesanan." });
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;

sequelize.sync({ alter: true }).then(async () => {
  console.log('Database terhubung.');
  // ... (Initial seeding logic stays the same) ...
  if (await Concert.count() === 0) {
      // ... (your existing bulkCreate code) ...
      await Concert.bulkCreate([
        { 
          name: 'POISONYA SYNDROME',
          artist: 'Nekomata Okayu', 
          price: 50, 
          stock: 3000, 
          venue: 'Tachikawa Stage Garden', 
          date: new Date('2026-09-30 20:00:00') 
        },
        { 
          name: 'PERSONYA RESPECT',
          artist: 'Nekomata Okayu', 
          price: 60, 
          stock: 12000, 
          venue: 'Pia Arena MM', 
          date: new Date('2027-05-28 20:00:00') 
        },
        { 
          name: "Ahoy!! You're All Pirates",
          artist: 'Houshou Marine', 
          price: 70, 
          stock: 20000, 
          venue: 'K-Arena', 
          date: new Date('2026-12-07 19:00:00') 
        },
        {
          name: 'FBKINGDOM "ANTHEM"',
          artist: 'Fubuki Shirakami',
          price: 60,
          stock: 12000,
          venue: 'Pia Arena MM',
          date: new Date('2027-02-13 18:00:00')
        },
        { 
          name: 'USAGI the MEGAMI!!-',
          artist: 'Usada Pekora',
          price: 55,
          stock: 15000,
          venue: 'Ariake Arena',
          date: new Date('2026-12-06 18:00:00')
        },
        { 
          name: 'Our Sparkle',
          artist: 'Ookami Mio',
          price: 50,
          stock: 12000,
          venue: 'Pia Arena MM',
          date: new Date('2026-09-10 18:00:00')
        },
        { 
          name: 'LOCK ON',
          artist: 'Amane Kanata',
          price: 52,
          stock: 15000,
          venue: 'Ariake Arena',
          date: new Date('2026-08-13 18:00:00')
        },
        { 
          name: 'Break your xxx',
          artist: 'Tokoyami Towa',
          price: 50,
          stock: 3000,
          venue: 'Tachikawa Stage Garden',
          date: new Date('2026-10-13 18:00:00')
        },
        { 
          name: 'SHINier',
          artist: 'Tokoyami Towa',
          price: 50,
          stock: 15000,
          venue: 'Ariake Arena',
          date: new Date('2027-10-29 18:00:00')
        },
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