// Asigna el rol Administrador a un usuario ya registrado.
// Uso: npm run db:admin -- correo@uao.edu.co
import { pool } from "../backend/src/config/database.js";

const correo = process.argv[2]?.trim().toLowerCase();
if (!correo) {
  console.error("Uso: npm run db:admin -- correo@uao.edu.co");
  process.exit(1);
}

try {
  const [result] = await pool.execute(
    `UPDATE usuario SET id_rol = (SELECT id_rol FROM rol WHERE nombre_rol = 'Administrador')
     WHERE correo = ?`,
    [correo],
  );
  if (result.affectedRows) {
    console.log(`${correo} ahora es Administrador. Cierra sesión y vuelve a ingresar para ver los cambios.`);
  } else {
    console.error(`No existe un usuario con el correo ${correo}. Regístralo primero desde /registro.`);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
