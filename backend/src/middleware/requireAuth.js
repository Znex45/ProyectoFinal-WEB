export function requireAuth(request, response, next) {
  if (!request.session?.user) {
    return response.status(401).json({ error: "Debes iniciar sesión" });
  }
  next();
}

export function requireAdmin(request, response, next) {
  if (!request.session?.user) {
    return response.status(401).json({ error: "Debes iniciar sesión" });
  }
  if (request.session.user.rol !== "Administrador") {
    return response.status(403).json({ error: "No tienes permisos" });
  }
  next();
}
