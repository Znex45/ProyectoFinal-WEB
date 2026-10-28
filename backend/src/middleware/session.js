import session from "express-session";
import { pool } from "../config/database.js";

const day = 24 * 60 * 60 * 1000;
const secret = process.env.SESSION_SECRET;
if (!secret || secret.length < 32) {
  throw new Error("SESSION_SECRET debe tener al menos 32 caracteres en backend/.env");
}

const expiresAt = (data) =>
  Math.round(new Date(data.cookie?.expires || Date.now() + day).getTime() / 1000);

class MySQLSessionStore extends session.Store {
  constructor() {
    super();
    this.ready = pool.query(`CREATE TABLE IF NOT EXISTS sessions (
      session_id varchar(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
      expires int unsigned NOT NULL,
      data mediumtext COLLATE utf8mb4_bin
    ) ENGINE=InnoDB`);
    this.ready.catch((error) => console.error("No se pudo crear la tabla sessions:", error));

    this.cleanup = setInterval(() => {
      this.ready
        .then(() => pool.execute("DELETE FROM sessions WHERE expires < ?", [Math.round(Date.now() / 1000)]))
        .catch((error) => console.error("No se pudieron borrar sesiones vencidas:", error));
    }, 15 * 60 * 1000);
    this.cleanup.unref();
  }

  get(id, done) {
    this.ready
      .then(() => pool.execute(
        "SELECT data FROM sessions WHERE session_id = ? AND expires >= ?",
        [id, Math.round(Date.now() / 1000)],
      ))
      .then(([rows]) => done(null, rows[0] ? JSON.parse(rows[0].data) : null), done);
  }

  set(id, data, done) {
    this.ready
      .then(() => pool.execute(
        `INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
        [id, expiresAt(data), JSON.stringify(data)],
      ))
      .then(() => done?.(), done);
  }

  touch(id, data, done) {
    this.ready
      .then(() => pool.execute(
        "UPDATE sessions SET expires = ? WHERE session_id = ?",
        [expiresAt(data), id],
      ))
      .then(() => done?.(), done);
  }

  destroy(id, done) {
    this.ready
      .then(() => pool.execute("DELETE FROM sessions WHERE session_id = ?", [id]))
      .then(() => done?.(), done);
  }

  close() {
    clearInterval(this.cleanup);
  }
}

export const sessionCookieName = process.env.SESSION_COOKIE_NAME || "prestamos.sid";
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export const sessionStore = new MySQLSessionStore();

export const sessionMiddleware = session({
  name: sessionCookieName,
  secret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { ...sessionCookieOptions, maxAge: day },
});
