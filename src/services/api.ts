import api from "@/lib/axios";

// Agrupá tus funciones por módulo si querés (auth, user, etc.)
export const apiLogin = (email: string, password: string) =>
  api.post("/auth/login", { email, password });

export const apiGetCurrentUser = () =>
  api.get("/auth/me");

export const apiUpdateProfile = (data: { name: string; avatar?: string }) =>
  api.put("/user/profile", data);

export const apiDeleteAccount = () =>
  api.delete("/user");
