import { login, watchAuth, getUserProfile, logout } from "./firebase.js";

const $ = id => document.getElementById(id);

let redirecting = false;

function messageForAuthError(code) {
  const messages = {
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/user-disabled": "Esta cuenta está deshabilitada.",
    "auth/too-many-requests": "Demasiados intentos. Intenta nuevamente más tarde.",
    "auth/network-request-failed": "No se pudo conectar con Firebase."
  };
  return messages[code] || "No se pudo iniciar sesión.";
}

watchAuth(async user => {
  if (!user || redirecting) return;

  try {
    const profile = await getUserProfile(user.uid);

    if (!profile) {
      $("authError").textContent = "Tu cuenta no tiene un perfil dentro del sistema.";
      await logout();
      return;
    }

    if (profile.active === false) {
      $("authError").textContent = "Tu cuenta está desactivada.";
      await logout();
      return;
    }

    redirecting = true;
    window.location.replace("./index.html");
  } catch (error) {
    console.error(error);
    $("authError").textContent = "No se pudo validar tu perfil.";
  }
});

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  const button = $("loginBtn");
  $("authError").textContent = "";
  button.disabled = true;
  button.textContent = "Ingresando...";

  try {
    await login(
      $("loginEmail").value.trim(),
      $("loginPassword").value
    );
  } catch (error) {
    console.error(error);
    $("authError").textContent = messageForAuthError(error.code);
    button.disabled = false;
    button.textContent = "Iniciar sesión";
  }
});

$("togglePassword").addEventListener("click", () => {
  const input = $("loginPassword");
  input.type = input.type === "password" ? "text" : "password";
});
