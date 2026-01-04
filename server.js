require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
// Import TransactionAddon if you implemented the previous step, otherwise keep as is
const { sequelize, Concert, Transaction, User, TransactionAddon } = require('./models');

const app = express();
app.use(cors());
app.use(express.json());

// Middleware: Verifikasi JWT
const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (err) return res.status(403).json({ message: "Invalid token" });
      req.user = user;
      next();
    });
  } else {
    res.status(401).json({ message: "Please login first" });
  }
};

// --- AUTH ROUTES ---
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ username, password: hashedPassword });
    res.status(201).json({ message: "User registered successfully", userId: user.id });
  } catch (error) {
    res.status(400).json({ message: "Username already taken" });
  }
});

app.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid username or password" });
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
  const { concertId, amount, bonusDrink } = req.body; // Added bonusDrink support
  const userId = req.user.id;

  const t = await sequelize.transaction();
  try {
    const concert = await Concert.findByPk(concertId, { transaction: t, lock: true });

    if (!concert) throw new Error('Concert not found');

    const existingTickets = await Transaction.sum('amount', {
      where: {
        userId: userId,
        concertId: concertId
      },
      transaction: t
    });

    const totalOwned = existingTickets || 0;

    if (totalOwned + amount > 2) {
      throw new Error('Maximum 2 tickets per account for this concert.');
    }

    // Validasi Waktu
    const now = new Date();
    const concertDate = new Date(concert.date);
    const deadline = new Date(concertDate.getTime() - (7 * 24 * 60 * 60 * 1000));

    if (now > deadline) {
      throw new Error('Sales closed. Purchase must be made at least 7 days before the concert.');
    }

    // Validasi Stok
    if (concert.stock < amount) throw new Error('Insufficient stock');

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

    // Handle Bonus Drinks (If implemented in models)
    if (bonusDrink && typeof bonusDrink === 'string' && TransactionAddon) {
        const drinkList = bonusDrink.split(', ');
        for (const drinkName of drinkList) {
            await TransactionAddon.create({
                transactionId: order.id,
                item_name: drinkName
            }, { transaction: t });
        }
    }

    await t.commit();
    res.json({ message: "Purchase successful!", order });

  } catch (error) {
    await t.rollback();
    res.status(400).json({ message: error.message });
  }
});

// --- ENDPOINT: LIHAT HISTORY PESANAN USER ---
app.get('/my-orders', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    // Check if TransactionAddon is defined to include it
    const includeOptions = [
        {
          model: Concert,
          attributes: ['name', 'artist', 'venue', 'date', 'price']
        }
    ];

    if (typeof TransactionAddon !== 'undefined') {
        includeOptions.push({
            model: TransactionAddon,
            attributes: ['item_name']
        });
    }

    const orders = await Transaction.findAll({
      where: { userId: userId },
      include: includeOptions,
      order: [['createdAt', 'DESC']]
    });

    if (orders.length === 0) {
      return res.json({ message: "You have no order history." });
    }

    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;

sequelize.sync({ alter: true }).then(async () => {
  console.log('Database connected.');

  if (await Concert.count() === 0) {
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
      console.log('User nekomata_okayu created!');
    }

  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});