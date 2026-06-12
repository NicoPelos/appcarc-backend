import Movimiento from '../models/Movimiento.js';

const VALID_PAYMENT_METHODS = ['Efectivo', 'Transferencia'];

export const createMovimientoHandler = async (req, res) => {
  try {
    const {
      type,
      amount,
      concept,
      responsable,
      paymentMethod,
      formId,
      description,
      date,
    } = req.body;

    if (!type || !['Ingreso', 'Egreso'].includes(type)) {
      return res.status(400).json({ message: 'Tipo de movimiento inválido' });
    }

    if (typeof amount !== 'number' || amount <= 0) {
      return res.status(400).json({ message: 'El importe debe ser un número mayor que cero' });
    }

    if (!concept || typeof concept !== 'string') {
      return res.status(400).json({ message: 'El concepto es obligatorio' });
    }

    if (!responsable || typeof responsable !== 'string') {
      return res.status(400).json({ message: 'El responsable es obligatorio' });
    }

    if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: 'La forma de pago debe ser Efectivo o Transferencia' });
    }

    const movementDate = date ? new Date(date) : new Date();
    if (Number.isNaN(movementDate.getTime())) {
      return res.status(400).json({ message: 'La fecha del movimiento es inválida' });
    }

    const movimiento = new Movimiento({
      clubId: req.user.clubId,
      userId: req.user.id,
      responsable,
      type,
      amount,
      concept,
      paymentMethod,
      formId: formId || '',
      description: description || '',
      date: movementDate,
      createdBy: req.user.email || req.user.id,
      updatedBy: req.user.email || req.user.id,
    });

    await movimiento.save();
    res.status(201).json(movimiento);
  } catch (error) {
    console.error('Error creando movimiento:', error);
    res.status(500).json({ message: 'Error al crear movimiento' });
  }
};
