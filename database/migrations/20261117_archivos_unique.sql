-- Migración 2026-11-17: nombre_almacenado único en archivo_multimedia.
-- Idempotente: puede ejecutarse varias veces y en bases creadas antes o después del cambio.
-- Aplicar con:  node scripts/db-migrate.mjs
--
-- Garantiza a nivel de base de datos que dos filas nunca apunten al mismo archivo físico.
-- Si la base ya tuviera duplicados (no debería: el servidor genera UUID), el ALTER fallará
-- y habrá que revisarlos con:
--   SELECT nombre_almacenado, COUNT(*) FROM archivo_multimedia GROUP BY 1 HAVING COUNT(*) > 1;

SET @existe := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'archivo_multimedia'
    AND INDEX_NAME = 'uq_archivo_nombre_almacenado'
);

SET @sql := IF(
  @existe = 0,
  'ALTER TABLE archivo_multimedia ADD CONSTRAINT uq_archivo_nombre_almacenado UNIQUE (nombre_almacenado)',
  'SELECT ''uq_archivo_nombre_almacenado ya existe'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
