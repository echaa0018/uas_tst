require('dotenv').config();
const { Sequelize, DataTypes } = require('sequelize');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  dialectOptions: {
    ssl: {
      require: true,
      rejectUnauthorized: false,
    },
  },
  logging: false,
});

// 1. Model User
const User = sequelize.define('User', {
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  role: { type: DataTypes.STRING, defaultValue: 'customer' }
});

// 2. Model Concert
const Concert = sequelize.define('Concert', {
  name: { type: DataTypes.STRING, allowNull: false },
  artist: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.INTEGER, allowNull: false },
  stock: { type: DataTypes.INTEGER, allowNull: false },
  venue: { type: DataTypes.STRING, allowNull: false },
  date: { type: DataTypes.DATE, allowNull: false }
});

// 3. Model Transaction
const Transaction = sequelize.define('Transaction', {
  amount: { type: DataTypes.INTEGER, allowNull: false },
  totalPrice: { type: DataTypes.INTEGER, allowNull: false }
}, { 
  timestamps: true // Mengaktifkan createdAt untuk riwayat transaksi
});

// Definisi Relasi
User.hasMany(Transaction, { foreignKey: 'userId' });
Transaction.belongsTo(User, { foreignKey: 'userId' });

Concert.hasMany(Transaction, { foreignKey: 'concertId' });
Transaction.belongsTo(Concert, { foreignKey: 'concertId' });

module.exports = { sequelize, Concert, Transaction, User };