import { Router } from "express";
import { register, login, me, logout } from "../controllers/authController.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const authRoutes = Router();
const asyncRoute = (handler) => (request, response, next) =>
  Promise.resolve(handler(request, response)).catch(next);

authRoutes.post("/register", asyncRoute(register));
authRoutes.post("/login", asyncRoute(login));
authRoutes.get("/me", requireAuth, me);
authRoutes.post("/logout", requireAuth, asyncRoute(logout));
