import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import swaggerJsDoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import routes from './appRoutes.js';

// Load environment variables
dotenv.config();

if (!process.env.JWT_SECRET) {
  console.warn('⚠️ JWT_SECRET no está definido. Usando secreto de desarrollo por defecto. Define JWT_SECRET en backend/.env para producción.');
  process.env.JWT_SECRET = 'dev_default_jwt_secret';
}

const app = express();
const PORT = process.env.PORT || 3001;

// Swagger Configuration
const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Club Andino Río Cuarto API',
      version: '1.0.0',
      description: 'API para la gestión de socios, cuotas y movimientos del CARC',
      contact: {
        name: 'Secretaría CARC',
      },
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Servidor de Desarrollo',
      },
    ],
  },
  apis: ['./src/appRoutes.js', './src/resources/**/*.js'], // Ahora Swagger escanea los recursos y el router global
};

const swaggerDocs = swaggerJsDoc(swaggerOptions);

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Connection
if (process.env.NODE_ENV !== 'test') {
  mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => {
      console.error('❌ MongoDB connection error:', err);
      process.exit(1); 
    });
}

// Swagger UI Route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Basic route
app.get('/', (req, res) => {
  res.send('Club Andino Rio Cuarto API');
});

// Use application routes
app.use('/api', routes);

// Start the server
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
  });
}

export default app;
