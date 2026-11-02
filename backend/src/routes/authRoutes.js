import { Router } from "express";
import { login, logout, me, register } from "../controllers/authController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validate } from "../middleware/validate.js";
import { loginSchema, registerSchema } from "../schemas/authSchemas.js";
import { asyncHandler } from "../utils/http.js";

export const authRoutes = Router();

authRoutes.post("/register", validate({ body: registerSchema }), asyncHandler(register));
authRoutes.post("/login", validate({ body: loginSchema }), asyncHandler(login));
authRoutes.get("/me", requireAuth, me);
authRoutes.post("/logout", asyncHandler(logout));
