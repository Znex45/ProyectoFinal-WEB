import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/requireAuth.js';
import { listarEquipos, obtenerCatalogos, obtenerEquipo, crearEquipo, actualizarEquipo, eliminarEquipo } from '../controllers/equipoController.js';

export const equipoRoutes = Router();
equipoRoutes.get('/', requireAuth, listarEquipos);
equipoRoutes.get('/catalogos', requireAuth, obtenerCatalogos);
equipoRoutes.get('/:id', requireAuth, obtenerEquipo);
equipoRoutes.post('/', requireAuth, requireAdmin, crearEquipo);
equipoRoutes.put('/:id', requireAuth, requireAdmin, actualizarEquipo);
equipoRoutes.delete('/:id', requireAuth, requireAdmin, eliminarEquipo);
