# Inventario Planner & Control — Firebase V3

## Estructura

login.html
- Solo autenticación.
- Si ya existe sesión válida, redirige a index.html.
- Valida que exista users/{UID}.
- Valida `active`.

index.html
- Solo sistema/dashboard.
- No contiene formulario de login.
- Si no existe sesión, redirige automáticamente a login.html.

login.js
- Inicio de sesión.
- Validación de perfil.
- Redirección.

app.js
- Dashboard.
- Planner.
- Actividades.
- Operación.
- Incidencias.
- Protección de ruta.
- Cierre de sesión.
- Permisos visuales básicos por rol.

firebase.js
- Inicialización Firebase.
- Authentication.
- Firestore.

firebase-config.js
- Tu configuración del proyecto.

## IMPORTANTE

Copia tu firebaseConfig REAL al archivo `firebase-config.js`.
La plantilla incluida contiene valores de ejemplo.

## Usuarios Firestore

Colección:
users

Documento:
users/{UID_DE_AUTHENTICATION}

Campos:
name: "Dilan Gil"
email: "..."
role: "inventario"
active: true

Roles:
- inventario
- sistemas
- direccion
- super_admin

## Flujo

1. Usuario visita login.html.
2. Firebase Authentication valida correo y contraseña.
3. login.js consulta users/{UID}.
4. Si el perfil está activo -> index.html.
5. index.html vuelve a validar la sesión.
6. Si alguien intenta abrir index.html sin login -> login.html.
7. Al pulsar Salir -> cierra sesión y regresa al login.

## Ejecutar

No abrir con doble clic.

Usa Live Server en VS Code o:

python3 -m http.server 5500

Luego:
http://localhost:5500/login.html
