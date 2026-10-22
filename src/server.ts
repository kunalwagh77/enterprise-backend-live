import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { prisma } from './db';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// 1. Health Check Endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({ message: '🚀 E-Commerce Enterprise API is Live with PgBouncer Pooling!' });
});

// 2. USER APIs (Create & Get Users)
app.post('/api/users', async (req: Request, res: Response) => {
  try {
    const { name, email } = req.body;
    const user = await prisma.user.create({
      data: { name, email },
    });
    res.status(201).json(user);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/users/:email', async (req: Request, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { email: req.params.email },
      include: { orders: { include: { items: true } } },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. PRODUCT APIs (Create & Inventory List)
app.post('/api/products', async (req: Request, res: Response) => {
  try {
    const { title, price, stock } = req.body;
    const product = await prisma.product.create({
      data: { title, price, stock },
    });
    res.status(201).json(product);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/products', async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany();
    res.json(products);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. ORDER API WITH ATOMIC TRANSACTION ($transaction & Stock Deduct)
app.post('/api/orders', async (req: Request, res: Response) => {
  const { userId, items } = req.body; // items: [{ productId, quantity }]

  try {
    const orderResult = await prisma.$transaction(async (tx) => {
      let totalAmount = 0;
      const orderItemsToCreate = [];

      // Stock Check & Reduction
      for (const item of items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) throw new Error(`Product ${item.productId} not found`);
        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for '${product.title}'`);
        }

        // Reduce Inventory Stock
        await tx.product.update({
          where: { id: item.productId },
          data: { stock: product.stock - item.quantity },
        });

        const itemTotal = product.price * item.quantity;
        totalAmount += itemTotal;

        orderItemsToCreate.push({
          productId: product.id,
          quantity: item.quantity,
          price: product.price,
        });
      }

      // Create Order Record
      const newOrder = await tx.order.create({
        data: {
          userId,
          totalAmount,
          status: 'COMPLETED',
          items: {
            create: orderItemsToCreate,
          },
        },
        include: { items: true },
      });

      return newOrder;
    });

    res.status(201).json(orderResult);
  } catch (error: any) {
    res.status(400).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});