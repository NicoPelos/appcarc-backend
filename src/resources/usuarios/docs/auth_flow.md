Resumen del flujo de autenticación

1) Idea general
- Las cuentas se identifican por `email` y, para el primer acceso de socios, el `DNI` puede usarse como contraseña temporal.
- Cuando un usuario se crea usando DNI como contraseña temporal, el campo `mustChangePassword` se marca `true`.
- El frontend debe forzar al usuario a cambiar la contraseña en su primer ingreso.

2) Endpoints relevantes
- `POST /api/auth/register` — body: `{ email, password?, dni?, nombre?, role?, clubId }`.
  - Si no se envía `password` pero sí `dni`, se creará una contraseña temporal (hash del DNI) y `mustChangePassword=true`.
  - Respuesta incluye `mustChangePassword`.

- `POST /api/auth/login` — body: `{ email, password }`.
  - Respuesta: `{ token, user: { id, email, nombre, role, clubId, mustChangePassword } }`.

- `POST /api/auth/login-dni` — body: `{ email, dni, clubId }`.
  - Flujo para primer acceso de socio: valida `Socio` por `dni` y `email`, crea usuario si no existía y devuelve `firstLogin: true` y `mustChangePassword`.
  - Respuesta: `{ token, firstLogin, user, socio }`.

- `PUT /api/auth/password` — protected, body: `{ currentPassword?, newPassword }`.
  - Si `mustChangePassword` es `true`, el frontend puede llamar este endpoint con sólo `newPassword` (no requiere `currentPassword`).
  - Tras cambiar, se limpia `mustChangePassword` y se actualiza `passwordChangedAt`.

- `POST /api/auth/google` — body: `{ idToken, clubId }`.
  - Login con Google; si el socio existe, se crea el usuario y se devuelve `mustChangePassword` (por defecto `false` salvo casos especiales).

3) Señales que el frontend debe usar
- Si la respuesta de login contiene `mustChangePassword: true` o `firstLogin: true`, mostrar pantalla de cambio de contraseña inmediatamente antes de permitir navegación al resto de la app.
- Para el cambio de contraseña, llamar `PUT /api/auth/password`.

4) Biometría / desbloqueo por patrón (cliente)
- Esto depende del cliente. Recomendación:
  - No enviar huellas/patrón al servidor.
  - Guardar credencial persistente (refresh token o token derivado) en almacenamiento seguro del dispositivo (Android Keystore / iOS Keychain / Web Credential Management API).
  - Proteger el acceso a esa credencial con biometría/patrón en el dispositivo; al desbloquearla, usarla para renovar `accessToken` con el backend.
  - Para web, usar WebAuthn para registrar credenciales públicas y autenticar sin mandar contraseñas.

5) Notas de seguridad
- No almacenar DNI en texto plano.
- Usar `bcrypt`/`argon2` para hashes de contraseña (ya implementado con `bcryptjs`).
- Exponer a frontend sólo el booleano `mustChangePassword`, nunca la contraseña ni el DNI.
- Implementar límites de intentos y monitorización para login.

6) Próximos pasos sugeridos
- Decidir si registrar `googleId` en el modelo `User` (ya se añadió el campo `googleId`).
- Implementar expiración/rotación de refresh tokens y almacenamiento en `devices` por usuario si se desea revocar sesiones por dispositivo.


