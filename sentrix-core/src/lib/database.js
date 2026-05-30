import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD || "secret",
  database: process.env.DB_DATABASE || "sentrix",
  waitForConnections: true,
  connectionLimit: 50, // Increased from 10 to handle more concurrent agents
  queueLimit: 0,
  connectTimeout: 10000, // 10 seconds
});

export default pool;
