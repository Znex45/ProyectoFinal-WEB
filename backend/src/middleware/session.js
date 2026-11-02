import session from "express-session";
import { env, isProduction, requireSessionConfig } from "../config/env.js";
import { pool } from "../config/database.js";

requireSessionConfig();

const day = 24 * 60 * 60 * 1000;

const expiresAt = (data) =>
  Math.round(new Date(data.cookie?.expires || Date.now() + day).getTime() / 1000);

// Almacena las sesiones en la tabla `sessions` (definida en database/schema.sql).
class MySQLSessionStore extends session.Store {
  constructor() {
    super();
    // Respaldo por si la base se creó con una versión anterior de schema.sql.
    this.ready = pool.query(`CREATE TABLE IF NOT EXISTS sessions (
      session_id VARCHAR(128) COLLATE utf8mb4_bin NOT NULL PRIMARY KEY,
      expires INT UNSIGNED NOT NULL,
      data MEDIUMTEXT COLLATE utf8mb4_bin,
      INDEX idx_sessions_expires (expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    this.ready.catch((error) => console.error("No se pudo preparar la tabla sessions:", error.message));

    this.cleanup = setInterval(() => {
      this.ready
        .then(() => pool.execute("DELETE FROM sessions WHERE expires < ?", [Math.round(Date.now() / 1000)]))
        .catch((error) => console.error("No se pudieron borrar sesiones vencidas:", error.message));
    }, 15 * 60 * 1000);
    this.cleanup.unref();
  }

  get(id, done) {
    this.ready
      .then(() =>
        pool.execute("SELECT data FROM sessions WHERE session_id = ? AND expires >= ?", [
          id,
          Math.round(Date.now() / 1000),
        ]),
      )
      .then(([rows]) => done(null, rows[0] ? JSON.parse(rows[0].data) : null), done);
  }

  set(id, data, done) {
    this.ready
      .then(() =>
        pool.execute(
          `INSERT INTO sessions (session_id, expires, data) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE expires = VALUES(expires), data = VALUES(data)`,
          [id, expiresAt(data), JSON.stringify(data)],
        ),
      )
      .then(() => done?.(), done);
  }

  touch(id, data, done) {
    this.ready
      .then(() => pool.execute("UPDATE sessions SET expires = ? WHERE session_id = ?", [expiresAt(data), id]))
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

export const sessionCookieName = env.sessionCookieName;
export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProduction,
  path: "/",
};

export const sessionStore = new MySQLSessionStore();

export const sessionMiddleware = session({
  name: sessionCookieName,
  secret: env.sessionSecret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: { ...sessionCookieOptions, maxAge: day },
});
