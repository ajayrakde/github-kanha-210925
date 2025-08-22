import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import session from "express-session";
import { insertProductSchema, insertOfferSchema, insertInfluencerSchema } from "@shared/schema";
import { z } from "zod";

const sessionConfig = session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
  },
});

interface SessionRequest extends Request {
  session: session.Session & {
    sessionId?: string;
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  app.use(sessionConfig);

  // Ensure session has a sessionId
  app.use((req: SessionRequest, res, next) => {
    if (!req.session.sessionId) {
      req.session.sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    next();
  });

  // Product routes
  app.get('/api/products', async (req, res) => {
    try {
      const products = await storage.getProducts();
      res.json(products);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ message: 'Failed to fetch products' });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.json(product);
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({ message: 'Failed to fetch product' });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const productData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(productData);
      res.json(product);
    } catch (error) {
      console.error('Error creating product:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid product data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create product' });
    }
  });

  app.patch('/api/products/:id', async (req, res) => {
    try {
      const productData = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(req.params.id, productData);
      res.json(product);
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ message: 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', async (req, res) => {
    try {
      await storage.deleteProduct(req.params.id);
      res.json({ message: 'Product deleted successfully' });
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ message: 'Failed to delete product' });
    }
  });

  // Cart routes
  app.get('/api/cart', async (req: SessionRequest, res) => {
    try {
      const cartItems = await storage.getCartItems(req.session.sessionId!);
      res.json(cartItems);
    } catch (error) {
      console.error('Error fetching cart:', error);
      res.status(500).json({ message: 'Failed to fetch cart' });
    }
  });

  app.post('/api/cart/add', async (req: SessionRequest, res) => {
    try {
      const { productId, quantity = 1 } = req.body;
      const cartItem = await storage.addToCart(req.session.sessionId!, productId, quantity);
      res.json(cartItem);
    } catch (error) {
      console.error('Error adding to cart:', error);
      res.status(500).json({ message: 'Failed to add to cart' });
    }
  });

  app.patch('/api/cart/:productId', async (req: SessionRequest, res) => {
    try {
      const { quantity } = req.body;
      const cartItem = await storage.updateCartItem(req.session.sessionId!, req.params.productId, quantity);
      res.json(cartItem);
    } catch (error) {
      console.error('Error updating cart item:', error);
      res.status(500).json({ message: 'Failed to update cart item' });
    }
  });

  app.delete('/api/cart/:productId', async (req: SessionRequest, res) => {
    try {
      await storage.removeFromCart(req.session.sessionId!, req.params.productId);
      res.json({ message: 'Item removed from cart' });
    } catch (error) {
      console.error('Error removing from cart:', error);
      res.status(500).json({ message: 'Failed to remove from cart' });
    }
  });

  // Offer validation and application
  app.post('/api/offers/validate', async (req: SessionRequest, res) => {
    try {
      const { code, userId, cartValue } = req.body;
      const validation = await storage.validateOffer(code, userId, cartValue);
      res.json(validation);
    } catch (error) {
      console.error('Error validating offer:', error);
      res.status(500).json({ message: 'Failed to validate offer' });
    }
  });

  // Mock OTP routes
  app.post('/api/otp/send', async (req, res) => {
    const { phone } = req.body;
    // In production, integrate with SMS gateway
    console.log(`Sending OTP to ${phone}: 123456`);
    res.json({ message: 'OTP sent successfully' });
  });

  app.post('/api/otp/verify', async (req, res) => {
    const { phone, otp } = req.body;
    // Mock verification - accept any 6 digit code
    if (otp && otp.length === 6) {
      // Check if user exists, create if not
      let user = await storage.getUserByPhone(phone);
      if (!user) {
        user = await storage.createUser({ phone });
      }
      res.json({ verified: true, user });
    } else {
      res.status(400).json({ message: 'Invalid OTP' });
    }
  });

  // Order routes
  app.post('/api/orders', async (req: SessionRequest, res) => {
    try {
      const { userId, userInfo, offerId, paymentMethod } = req.body;
      const cartItems = await storage.getCartItems(req.session.sessionId!);
      
      if (cartItems.length === 0) {
        return res.status(400).json({ message: 'Cart is empty' });
      }

      // Update user info if provided
      if (userInfo && userId) {
        await storage.updateUser(userId, userInfo);
      }

      // Calculate totals
      const subtotal = cartItems.reduce((sum, item) => sum + (parseFloat(item.product.price) * item.quantity), 0);
      let discountAmount = 0;

      // Apply offer if provided
      if (offerId) {
        const offer = await storage.getOfferByCode(offerId);
        if (offer) {
          if (offer.discountType === 'percentage') {
            discountAmount = (subtotal * parseFloat(offer.discountValue)) / 100;
            if (offer.maxDiscount) {
              discountAmount = Math.min(discountAmount, parseFloat(offer.maxDiscount));
            }
          } else {
            discountAmount = parseFloat(offer.discountValue);
          }
        }
      }

      const total = subtotal - discountAmount;

      // Create order
      const orderData = {
        userId,
        subtotal: subtotal.toString(),
        discountAmount: discountAmount.toString(),
        total: total.toString(),
        offerId: offerId || undefined,
        paymentMethod,
        paymentStatus: 'completed', // Mock successful payment
        status: 'confirmed',
        deliveryAddress: `${userInfo?.address}, ${userInfo?.city} - ${userInfo?.pincode}`,
      };

      const orderItems = cartItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.product.price,
      }));

      const order = await storage.createOrder(orderData, orderItems);

      // Create offer redemption if offer was used
      if (offerId && userId) {
        const offer = await storage.getOfferByCode(offerId);
        if (offer) {
          await storage.createOfferRedemption({
            offerId: offer.id,
            userId,
            orderId: order.id,
            discountAmount: discountAmount.toString(),
          });
          await storage.incrementOfferUsage(offer.id);
        }
      }

      // Clear cart
      await storage.clearCart(req.session.sessionId!);

      res.json({ order, message: 'Order placed successfully' });
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ message: 'Failed to create order' });
    }
  });

  app.get('/api/orders', async (req, res) => {
    try {
      const orders = await storage.getOrders();
      res.json(orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ message: 'Failed to fetch orders' });
    }
  });

  app.get('/api/orders/:id', async (req, res) => {
    try {
      const order = await storage.getOrder(req.params.id);
      if (!order) {
        return res.status(404).json({ message: 'Order not found' });
      }
      res.json(order);
    } catch (error) {
      console.error('Error fetching order:', error);
      res.status(500).json({ message: 'Failed to fetch order' });
    }
  });

  // Admin routes
  app.get('/api/admin/orders/export', async (req, res) => {
    try {
      const orders = await storage.getOrders();
      
      // Simple CSV format
      const csvHeader = 'Order ID,Customer Name,Phone,Email,Total,Status,Date,Address\n';
      const csvRows = orders.map(order => {
        const user = order.user;
        return [
          order.id,
          user.name || 'N/A',
          user.phone,
          user.email || 'N/A',
          `₹${order.total}`,
          order.status,
          order.createdAt?.toISOString().split('T')[0] || 'N/A',
          order.deliveryAddress || 'N/A'
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
      }).join('\n');

      const csv = csvHeader + csvRows;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
      res.send(csv);
    } catch (error) {
      console.error('Error exporting orders:', error);
      res.status(500).json({ message: 'Failed to export orders' });
    }
  });

  app.get('/api/admin/abandoned-carts', async (req, res) => {
    try {
      const abandonedCarts = await storage.getAbandonedCarts();
      res.json(abandonedCarts);
    } catch (error) {
      console.error('Error fetching abandoned carts:', error);
      res.status(500).json({ message: 'Failed to fetch abandoned carts' });
    }
  });

  // Influencer routes
  app.get('/api/influencers', async (req, res) => {
    try {
      const influencers = await storage.getInfluencers();
      res.json(influencers);
    } catch (error) {
      console.error('Error fetching influencers:', error);
      res.status(500).json({ message: 'Failed to fetch influencers' });
    }
  });

  app.post('/api/influencers', async (req, res) => {
    try {
      const influencerData = insertInfluencerSchema.parse(req.body);
      const influencer = await storage.createInfluencer(influencerData);
      res.json(influencer);
    } catch (error) {
      console.error('Error creating influencer:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid influencer data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create influencer' });
    }
  });

  app.get('/api/influencers/:id/stats', async (req, res) => {
    try {
      const stats = await storage.getInfluencerStats(req.params.id);
      res.json(stats);
    } catch (error) {
      console.error('Error fetching influencer stats:', error);
      res.status(500).json({ message: 'Failed to fetch influencer stats' });
    }
  });

  app.get('/api/influencers/:id/offers', async (req, res) => {
    try {
      const offers = await storage.getOffersByInfluencer(req.params.id);
      res.json(offers);
    } catch (error) {
      console.error('Error fetching influencer offers:', error);
      res.status(500).json({ message: 'Failed to fetch influencer offers' });
    }
  });

  // Offer management routes
  app.get('/api/offers', async (req, res) => {
    try {
      const offers = await storage.getOffers();
      res.json(offers);
    } catch (error) {
      console.error('Error fetching offers:', error);
      res.status(500).json({ message: 'Failed to fetch offers' });
    }
  });

  app.post('/api/offers', async (req, res) => {
    try {
      const offerData = insertOfferSchema.parse(req.body);
      const offer = await storage.createOffer(offerData);
      res.json(offer);
    } catch (error) {
      console.error('Error creating offer:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid offer data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create offer' });
    }
  });

  app.patch('/api/offers/:id', async (req, res) => {
    try {
      const offerData = insertOfferSchema.partial().parse(req.body);
      const offer = await storage.updateOffer(req.params.id, offerData);
      res.json(offer);
    } catch (error) {
      console.error('Error updating offer:', error);
      res.status(500).json({ message: 'Failed to update offer' });
    }
  });

  app.delete('/api/offers/:id', async (req, res) => {
    try {
      await storage.deleteOffer(req.params.id);
      res.json({ message: 'Offer deleted successfully' });
    } catch (error) {
      console.error('Error deleting offer:', error);
      res.status(500).json({ message: 'Failed to delete offer' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
