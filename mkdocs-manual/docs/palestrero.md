# Manual de Palestrero

El rol **Palestrero** es quien atiende el muro de escalada libre: registra cada visita (de socios y de gente externa), cobra el pase diario en el momento, y carga sus propias horas trabajadas.

```text title="Login de prueba"
palestrero@demo.appclub.ar / DemoPalestrero2026!
```

!!! tip "¿Sos palestrero en el CARC?"
    Entrá con tu usuario real desde [/app/login](https://raspberrypi.tail703951.ts.net/app/login) para ver el muro real y tus propias horas.

## 1. Check-in de muro libre y cobro del pase

Cada visita al muro (sea de un socio o de alguien externo) se registra acá, junto con si paga pase **diario** o **mensual**, y si ya está pagado o queda pendiente.

<figure markdown>
  ![Check-ins del día](assets/screenshots/palestrero-murolibre-lista.png){ width="260" }
  <figcaption>Check-ins del día</figcaption>
</figure>

<figure markdown>
  ![Nuevo check-in](assets/screenshots/palestrero-murolibre-checkin-modal.png){ width="260" }
  <figcaption>Nuevo check-in</figcaption>
</figure>

Arriba de la lista hay chips para filtrar lo que se muestra (`Hoy`, `3 días`, `7 días`, `30 días`), con el total de check-ins del período a la derecha.

1. Andá a `Muro Libre` y tocá el botón de agregar (+). Si el socio tiene su credencial QR a mano, en vez del + podés tocar el ícono de QR (arriba a la derecha) y escanearla: queda el check-in al instante como pase diario con el pago en estado pendiente, sin pasar por el formulario — después hay que cobrarlo o dejarlo pendiente según corresponda.
2. Buscá a la persona por nombre o DNI. Si ya es socio, va a aparecer en los resultados con su estado. Si no aparece nadie, tocá "¿No es socio? Registrar como visitante externo" y cargá nombre (obligatorio), apellido y DNI (opcionales).
3. Elegí la fecha del check-in.
4. Elegí el tipo de pase: `diario` o `mensual`. El pase mensual solo está disponible para socios — a una persona externa solo se le puede cobrar el diario. Si al elegir el socio ya tiene un pase mensual vigente, la app muestra esa info junto a su nombre para que no se lo cobres de nuevo.
5. Elegí el estado de pago: `pagado`, `pendiente` o `exento`.
6. Si está pagado, elegí la forma de pago (`Efectivo` / `Transferencia`).
7. Opcional: agregá una observación en el campo de texto libre al final del formulario.
8. Confirmá — queda el check-in con fecha y hora.

Para corregir un check-in ya cargado (por ejemplo si te equivocaste de tipo de pase o forma de pago), tocá el lápiz en su fila de la lista; el tacho de al lado lo elimina.

## 2. Cargar tus horas trabajadas

Igual que el profesor, cada hora que cargás queda asociada a tu nombre, y así el admin sabe cuánto corresponde pagarte cada mes.

<figure markdown>
  ![Horas cargadas](assets/screenshots/palestrero-horarios-lista.png){ width="260" }
  <figcaption>Horas cargadas</figcaption>
</figure>

1. Andá a `Horarios` y tocá el botón de agregar (+).
2. Elegí la fecha, la hora de entrada y de salida.
3. Elegí el tipo de tarea — la lista muestra todas las etiquetas de hora del club, así que elegí la que te corresponde a vos (por ejemplo, "Hora Palestrero").
4. Confirmá — el formulario es el mismo que usa un profesor, solo cambia qué etiqueta corresponde pagarte.

La pantalla también tiene una solapa `Resumen`, con el total de horas que cargaste cada mes agrupado por tipo de tarea.

## 3. Notificaciones

Tocando el ícono de campana desde Inicio se ven tus notificaciones personales. Hoy los avisos proactivos del club (alta de socio, check-in con advertencias) están dirigidos a secretaría — ver el [manual de Admin](admin.md#12-notificaciones).
