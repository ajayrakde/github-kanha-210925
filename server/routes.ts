import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import rateLimit from "express-rate-limit";
import { storage } from "./storage";
import { otpService } from "./otp-service";
import session from "express-session";
import { insertProductSchema, insertOfferSchema, insertUserAddressSchema, insertUserSchema, insertShippingRuleSchema } from "@shared/schema";
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
    adminId?: string;
    userId?: string;
    userRole?: 'admin' | 'influencer' | 'buyer';
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Rate limiting configuration
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: { message: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // limit each IP to 10 auth attempts per windowMs
    message: { message: 'Too many authentication attempts, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // limit each IP to 5 uploads per minute
    message: { message: 'Too many file uploads, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // limit each IP to 5 OTP requests per windowMs
    message: { message: 'Too many OTP requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  // Trust proxy for rate limiting when behind proxy (production)
  app.set('trust proxy', 1);

  // Apply rate limiting
  app.use('/api', generalLimiter);
  app.use('/api/auth', authLimiter);
  app.use('/api/objects/upload', uploadLimiter);
  app.use('/api/otp', otpLimiter);
  app.use('/api/auth/send-otp', otpLimiter);
  app.use('/api/auth/verify-otp', otpLimiter);

  app.use(sessionConfig);

  // Admin middleware
  const requireAdmin = (req: SessionRequest, res: any, next: any) => {
    if (req.session.adminId && req.session.userRole === 'admin') {
      next();
    } else {
      res.status(401).json({ message: 'Admin access required' });
    }
  };

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

  app.post('/api/products', requireAdmin, async (req, res) => {
    try {
      // Check product limit (max 10 products)
      const existingProducts = await storage.getProducts();
      if (existingProducts.length >= 10) {
        return res.status(400).json({ message: 'Maximum 10 products allowed. Please delete existing products to add new ones.' });
      }
      
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

  app.patch('/api/products/:id', requireAdmin, async (req, res) => {
    try {
      const productData = insertProductSchema.partial().parse(req.body);
      const product = await storage.updateProduct(req.params.id, productData);
      res.json(product);
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ message: 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', requireAdmin, async (req, res) => {
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

  app.delete('/api/cart/clear', async (req: SessionRequest, res) => {
    try {
      await storage.clearCart(req.session.sessionId!);
      res.json({ message: 'Cart cleared successfully' });
    } catch (error) {
      console.error('Error clearing cart:', error);
      res.status(500).json({ message: 'Failed to clear cart' });
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

  app.post('/api/otp/verify', async (req: SessionRequest, res) => {
    const { phone, otp } = req.body;
    // Get OTP length from settings for validation
    const otpLengthSetting = await storage.getAppSetting('otp_length');
    const expectedOtpLength = otpLengthSetting?.value ? parseInt(otpLengthSetting.value) : 6;
    
    // Mock verification - accept any code with configured length
    if (otp && otp.length === expectedOtpLength) {
      // Check if user exists, create if not
      let user = await storage.getUserByPhone(`+91${phone}`);
      if (!user) {
        user = await storage.createUser({ 
          phone: `+91${phone}`,
          name: '',
          email: null
        });
      }
      // Regenerate session to prevent fixation attacks  
      req.session.regenerate((err) => {
        if (err) {
          console.error('Session regenerate error:', err);
          return res.status(500).json({ message: 'Session error' });
        }
        
        // Set user session after regeneration
        req.session.userId = user.id;
        req.session.userRole = 'buyer';
        
        // Save the new session
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error:', saveErr);
            return res.status(500).json({ message: 'Session error' });
          }
          res.json({ verified: true, user, authenticated: true });
        });
      });
    } else {
      res.status(400).json({ message: 'Invalid OTP' });
    }
  });

  // User authentication routes

  app.post('/api/auth/login', async (req: SessionRequest, res) => {
    const { phone, otp } = req.body;
    // Get OTP length from settings for validation
    const otpLengthSetting = await storage.getAppSetting('otp_length');
    const expectedOtpLength = otpLengthSetting?.value ? parseInt(otpLengthSetting.value) : 6;
    
    // Mock verification - accept any code with configured length
    if (otp && otp.length === expectedOtpLength) {
      // Check if user exists
      let user = await storage.getUserByPhone(`+91${phone}`);
      if (!user) {
        // Create new user during login if doesn't exist
        user = await storage.createUser({ 
          phone: `+91${phone}`,
          name: '',
          email: null
        });
      }
      // Set user session
      req.session.userId = user.id;
      req.session.userRole = 'buyer';
      res.json({ success: true, user });
    } else {
      res.status(400).json({ message: 'Invalid OTP' });
    }
  });

  app.post('/api/auth/logout', async (req: SessionRequest, res) => {
    req.session.userId = undefined;
    req.session.userRole = undefined;
    res.json({ message: 'Logged out successfully' });
  });

  app.get('/api/auth/me', async (req: SessionRequest, res) => {
    if (req.session.userId && req.session.userRole === 'buyer') {
      try {
        const user = await storage.getUser(req.session.userId);
        if (user) {
          res.json({ authenticated: true, user });
        } else {
          res.status(401).json({ authenticated: false });
        }
      } catch (error) {
        console.error('Error fetching user:', error);
        res.status(500).json({ authenticated: false });
      }
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  app.get('/api/auth/orders', async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== 'buyer') {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const orders = await storage.getOrdersByUser(req.session.userId);
      res.json(orders);
    } catch (error) {
      console.error('Error fetching user orders:', error);
      res.status(500).json({ message: 'Failed to fetch orders' });
    }
  });

  // User address management routes
  app.get('/api/auth/addresses', async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== 'buyer') {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const addresses = await storage.getUserAddresses(req.session.userId);
      res.json(addresses);
    } catch (error) {
      console.error('Error fetching user addresses:', error);
      res.status(500).json({ message: 'Failed to fetch addresses' });
    }
  });

  // Get last order's delivery address for UI
  app.get('/api/auth/addresses/last', async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== 'buyer') {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const lastOrderAddress = await storage.getLastOrderAddress(req.session.userId);
      res.json(lastOrderAddress);
    } catch (error) {
      console.error('Error fetching last order address:', error);
      res.status(500).json({ message: 'Failed to fetch last order address' });
    }
  });

  app.post('/api/auth/addresses', async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== 'buyer') {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      const { name, address, city, pincode, isPreferred } = req.body;
      
      // If this is the first address, make it preferred automatically
      const existingAddresses = await storage.getUserAddresses(req.session.userId);
      const shouldBePreferred = isPreferred || existingAddresses.length === 0;
      
      const newAddress = await storage.createUserAddress({
        userId: req.session.userId,
        name,
        address,
        city,
        pincode,
        isPreferred: shouldBePreferred,
      });

      // If this should be preferred, update others
      if (shouldBePreferred && existingAddresses.length > 0) {
        await storage.setPreferredAddress(req.session.userId, newAddress.id);
      }

      res.json(newAddress);
    } catch (error) {
      console.error('Error creating address:', error);
      res.status(500).json({ message: 'Failed to create address' });
    }
  });

  app.put('/api/auth/addresses/:id/preferred', async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== 'buyer') {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      await storage.setPreferredAddress(req.session.userId, req.params.id);
      res.json({ message: 'Preferred address updated' });
    } catch (error) {
      console.error('Error setting preferred address:', error);
      res.status(500).json({ message: 'Failed to set preferred address' });
    }
  });

  app.delete('/api/auth/addresses/:id', async (req: SessionRequest, res) => {
    if (!req.session.userId || req.session.userRole !== 'buyer') {
      return res.status(401).json({ message: 'Authentication required' });
    }
    
    try {
      await storage.deleteUserAddress(req.params.id, req.session.userId);
      res.json({ message: 'Address deleted' });
    } catch (error) {
      console.error('Error deleting address:', error);
      res.status(500).json({ message: 'Failed to delete address' });
    }
  });

  // Order creation schema validation
  const orderCreationSchema = z.object({
    userInfo: z.object({
      name: z.string().optional(),
      email: z.string().email().or(z.literal("")).optional().nullable(),
      addressLine1: z.string().min(1, 'Address line 1 is required'),
      addressLine2: z.string().min(1, 'Address line 2 is required'),
      addressLine3: z.string().optional(),
      landmark: z.string().optional(),
      city: z.string().min(1, 'City is required'),
      pincode: z.string().min(1, 'Pincode is required'),
      makePreferred: z.boolean().optional().default(false),
    }).optional(),
    offerId: z.string().optional().nullable(),
    paymentMethod: z.string().min(1, 'Payment method is required'),
    selectedAddressId: z.string().optional().nullable(),
  });

  // Order routes
  app.post('/api/orders', async (req: SessionRequest, res) => {
    // Authentication check
    if (!req.session.userId || req.session.userRole !== 'buyer') {
      return res.status(401).json({ message: 'Authentication required' });
    }

    try {
      // Validate request body
      const validatedData = orderCreationSchema.parse(req.body);
      const { userInfo, offerId, paymentMethod, selectedAddressId } = validatedData;
      const userId = req.session.userId; // Use authenticated user ID
      
      const cartItems = await storage.getCartItems(req.session.sessionId!);
      
      if (cartItems.length === 0) {
        return res.status(400).json({ message: 'Cart is empty' });
      }

      let deliveryAddressId = selectedAddressId;

      // Validate selected address ownership if provided
      if (selectedAddressId) {
        const userAddresses = await storage.getUserAddresses(userId);
        const selectedAddress = userAddresses.find(addr => addr.id === selectedAddressId);
        if (!selectedAddress) {
          return res.status(400).json({ message: 'Selected address does not belong to user' });
        }
      }

      // Handle new address creation
      if (!selectedAddressId && userInfo) {
        // Validate address data
        const addressValidationSchema = insertUserAddressSchema.omit({ userId: true }).extend({
          makePreferred: z.boolean().optional().default(false),
        });
        
        // Combine address lines into single address field for storage
        const fullAddress = [userInfo.addressLine1, userInfo.addressLine2, userInfo.addressLine3]
          .filter(line => line?.trim())
          .join('\n');
        
        const validatedAddressData = addressValidationSchema.parse({
          name: 'Delivery Address',
          address: fullAddress,
          city: userInfo.city,
          pincode: userInfo.pincode,
          makePreferred: userInfo.makePreferred,
        });
        
        // Check if user has any existing addresses
        const existingAddresses = await storage.getUserAddresses(userId);
        
        // If no existing addresses, make this the preferred one automatically
        const shouldBePreferred = validatedAddressData.makePreferred || existingAddresses.length === 0;
        
        const addressData = {
          userId,
          name: existingAddresses.length === 0 ? 'Primary Address' : 'Delivery Address',
          address: validatedAddressData.address,
          city: validatedAddressData.city,
          pincode: validatedAddressData.pincode,
          isPreferred: shouldBePreferred,
        };
        
        const newAddress = await storage.createUserAddress(addressData);
        
        // If this should be preferred and there are existing addresses, update preferences
        if (shouldBePreferred && existingAddresses.length > 0) {
          await storage.setPreferredAddress(userId, newAddress.id);
        }
        
        deliveryAddressId = newAddress.id;
      }

      if (!deliveryAddressId) {
        return res.status(400).json({ message: 'Delivery address is required' });
      }

      // Update user info if provided (name, email)
      if (userInfo) {
        const { addressLine1, addressLine2, addressLine3, landmark, city, pincode, makePreferred, ...userInfoToUpdate } = userInfo;
        if (Object.keys(userInfoToUpdate).length > 0) {
          // Validate user update data, handle empty email
          const userUpdateSchema = insertUserSchema.partial().pick({ name: true, email: true }).extend({
            email: z.string().email().or(z.literal("")).optional().nullable(),
          });
          const validatedUserUpdate = userUpdateSchema.parse(userInfoToUpdate);
          // Convert empty string to null for database
          if (validatedUserUpdate.email === "") {
            validatedUserUpdate.email = null;
          }
          await storage.updateUser(userId, validatedUserUpdate);
        }
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

      // Calculate shipping charges based on rules
      const address = await storage.getUserAddresses(userId).then(addresses => 
        addresses.find(addr => addr.id === deliveryAddressId)
      );
      
      const shippingCharge = address ? await storage.calculateShippingCharge({
        cartItems,
        pincode: address.pincode,
        orderValue: subtotal
      }) : 50; // Fallback to default if address not found

      const total = subtotal - discountAmount + shippingCharge;

      // Create order with validated data
      const orderData = {
        userId,
        subtotal: subtotal.toString(),
        discountAmount: discountAmount.toString(),
        shippingCharge: shippingCharge.toString(),
        total: total.toString(),
        offerId: offerId || undefined,
        paymentMethod,
        paymentStatus: 'completed', // Mock successful payment
        status: 'confirmed',
        deliveryAddressId,
      };

      const order = await storage.createOrder(orderData);

      const orderItems = cartItems.map(item => ({
        productId: item.productId,
        quantity: item.quantity,
        price: item.product.price,
        orderId: order.id,
      }));

      await storage.createOrderItems(orderItems);

      // Create offer redemption if offer was used
      if (offerId) {
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
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: 'Invalid order data', errors: error.errors });
      }
      res.status(500).json({ message: 'Failed to create order' });
    }
  });

  app.get('/api/orders', async (req, res) => {
    try {
      const filters = {
        status: req.query.status as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      };
      
      // Remove undefined values
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value && value !== 'all')
      );
      
      const orders = await storage.getOrders(Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined);
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
      const filters = {
        status: req.query.status as string,
        startDate: req.query.startDate as string,
        endDate: req.query.endDate as string,
      };
      
      // Remove undefined values
      const cleanFilters = Object.fromEntries(
        Object.entries(filters).filter(([_, value]) => value && value !== 'all')
      );
      
      const orders = await storage.getOrders(Object.keys(cleanFilters).length > 0 ? cleanFilters : undefined);
      
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
order.deliveryAddress ? `${order.deliveryAddress.address}, ${order.deliveryAddress.city} - ${order.deliveryAddress.pincode}` : 'N/A'
        ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(',');
      }).join('\n');

      const csv = csvHeader + csvRows;
      
      // Generate filename with current date in ddmmyyyy format
      const now = new Date();
      const day = String(now.getDate()).padStart(2, '0');
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const year = now.getFullYear();
      const filename = `orders_${day}${month}${year}.csv`;
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      console.error('Error exporting orders:', error);
      res.status(500).json({ message: 'Failed to export orders' });
    }
  });


  // Offer management routes
  app.get('/api/offers', async (req, res) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 25;
      const influencerId = req.query.influencerId as string;
      const isActiveParam = req.query.isActive as string;
      
      let allOffers = await storage.getOffers();
      
      // Apply filters
      if (influencerId && influencerId !== 'all') {
        allOffers = allOffers.filter(offer => offer.influencerId === influencerId);
      }
      
      if (isActiveParam && isActiveParam !== 'all') {
        const isActive = isActiveParam === 'true';
        allOffers = allOffers.filter(offer => offer.isActive === isActive);
      }
      
      // Calculate pagination
      const total = allOffers.length;
      const totalPages = Math.ceil(total / limit);
      const offset = (page - 1) * limit;
      const paginatedOffers = allOffers.slice(offset, offset + limit);
      
      // Return paginated response if pagination parameters are provided
      if (req.query.page || req.query.limit) {
        res.json({
          data: paginatedOffers,
          total,
          page,
          limit,
          totalPages
        });
      } else {
        // Return all offers for backward compatibility
        res.json(allOffers);
      }
    } catch (error) {
      console.error('Error fetching offers:', error);
      res.status(500).json({ message: 'Failed to fetch offers' });
    }
  });

  app.post('/api/offers', requireAdmin, async (req, res) => {
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

  app.patch('/api/offers/:id', requireAdmin, async (req, res) => {
    try {
      const offerData = insertOfferSchema.partial().parse(req.body);
      const offer = await storage.updateOffer(req.params.id, offerData);
      res.json(offer);
    } catch (error) {
      console.error('Error updating offer:', error);
      res.status(500).json({ message: 'Failed to update offer' });
    }
  });

  app.delete('/api/offers/:id', requireAdmin, async (req, res) => {
    try {
      await storage.deleteOffer(req.params.id);
      res.json({ message: 'Offer deleted successfully' });
    } catch (error) {
      console.error('Error deleting offer:', error);
      res.status(500).json({ message: 'Failed to delete offer' });
    }
  });

  // Authentication routes
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const admin = await storage.validateAdminLogin(username, password);
      if (admin) {
        req.session.adminId = admin.id;
        req.session.userRole = 'admin';
        res.json({ success: true, admin: { id: admin.id, username: admin.username, name: admin.name } });
      } else {
        res.status(401).json({ message: 'Invalid credentials' });
      }
    } catch (error) {
      console.error('Admin login error:', error);
      res.status(500).json({ message: 'Login failed' });
    }
  });

  app.post('/api/admin/logout', (req, res) => {
    req.session.adminId = undefined;
    req.session.userRole = undefined;
    res.json({ message: 'Logged out successfully' });
  });

  // Object storage routes for product images
  app.post('/api/objects/upload', async (req, res) => {
    try {
      // Server-side file size validation (5MB limit)
      const maxFileSize = 5 * 1024 * 1024; // 5MB in bytes
      const contentLength = parseInt(req.headers['content-length'] || '0');
      
      if (contentLength > maxFileSize) {
        return res.status(400).json({ 
          message: `File too large. Maximum size allowed is ${Math.round(maxFileSize / (1024 * 1024))}MB` 
        });
      }

      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  app.get('/objects/:objectPath(*)', async (req, res) => {
    try {
      const { ObjectStorageService } = await import('./objectStorage');
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      // Simple download without ACL checks for product images
      const stream = objectFile.createReadStream();
      stream.pipe(res);
    } catch (error) {
      console.error("Error serving object:", error);
      res.status(404).json({ message: "Object not found" });
    }
  });

  // Influencer routes
  app.get('/api/influencers', async (req, res) => {
    try {
      const influencers = await storage.getInfluencers();
      res.json(influencers);
    } catch (error) {
      console.error("Error fetching influencers:", error);
      res.status(500).json({ message: "Failed to fetch influencers" });
    }
  });

  app.post('/api/influencers', async (req, res) => {
    try {
      const newInfluencer = await storage.createInfluencer(req.body);
      res.status(201).json(newInfluencer);
    } catch (error) {
      console.error("Error creating influencer:", error);
      res.status(500).json({ message: "Failed to create influencer" });
    }
  });

  app.patch('/api/influencers/:id/deactivate', async (req, res) => {
    try {
      await storage.deactivateInfluencer(req.params.id);
      res.json({ message: "Influencer deactivated successfully" });
    } catch (error) {
      console.error("Error deactivating influencer:", error);
      res.status(500).json({ message: "Failed to deactivate influencer" });
    }
  });

  app.get('/api/admin/me', (req, res) => {
    if (req.session.adminId && req.session.userRole === 'admin') {
      res.json({ authenticated: true, role: 'admin', id: req.session.adminId });
    } else {
      res.status(401).json({ authenticated: false });
    }
  });

  // Admin app settings management
  app.get("/api/admin/settings", requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAppSettings();
      res.json(settings);
    } catch (error) {
      console.error("Error fetching app settings:", error);
      res.status(500).json({ error: "Failed to fetch settings" });
    }
  });

  app.patch("/api/admin/settings/:key", requireAdmin, async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      
      if (!value) {
        return res.status(400).json({ error: "Value is required" });
      }

      const admin = await storage.getAdmin(req.session.adminId!);
      const updated = await storage.updateAppSetting(key, value, admin?.name || 'Admin');
      
      res.json(updated);
    } catch (error) {
      console.error("Error updating app setting:", error);
      res.status(500).json({ error: "Failed to update setting" });
    }
  });

  // Public endpoint to get specific setting (for OTP length, etc.)
  app.get("/api/settings/:key", async (req, res) => {
    try {
      const { key } = req.params;
      
      // Only allow public settings to be accessed
      const publicSettings = ['otp_length', 'otp_login_enabled'];
      if (!publicSettings.includes(key)) {
        return res.status(403).json({ error: "Setting not publicly accessible" });
      }
      
      const setting = await storage.getAppSetting(key);
      if (!setting) {
        return res.status(404).json({ error: "Setting not found" });
      }
      
      res.json(setting);
    } catch (error) {
      console.error("Error fetching app setting:", error);
      res.status(500).json({ error: "Failed to fetch setting" });
    }
  });

  // Shipping rules management endpoints
  app.get("/api/admin/shipping-rules", requireAdmin, async (req, res) => {
    try {
      const rules = await storage.getShippingRules();
      res.json(rules);
    } catch (error) {
      console.error("Error fetching shipping rules:", error);
      res.status(500).json({ error: "Failed to fetch shipping rules" });
    }
  });

  app.get("/api/admin/shipping-rules/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);
      
      const rule = await storage.getShippingRule(id);
      if (!rule) {
        return res.status(404).json({ error: "Shipping rule not found" });
      }
      res.json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: "Invalid ID parameter", 
          details: error.errors 
        });
      }
      console.error("Error fetching shipping rule:", error);
      res.status(500).json({ error: "Failed to fetch shipping rule" });
    }
  });

  app.post("/api/admin/shipping-rules", requireAdmin, async (req, res) => {
    try {
      const validatedData = insertShippingRuleSchema.parse(req.body);
      
      const rule = await storage.createShippingRule(validatedData);
      
      res.status(201).json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      console.error("Error creating shipping rule:", error);
      res.status(500).json({ error: "Failed to create shipping rule" });
    }
  });

  app.patch("/api/admin/shipping-rules/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);
      
      // Check if request body is empty or all values are undefined
      const bodyKeys = Object.keys(req.body).filter(key => req.body[key] !== undefined);
      if (bodyKeys.length === 0) {
        return res.status(400).json({ error: "No updates provided" });
      }
      
      // Fetch existing rule to determine effective type
      const existingRule = await storage.getShippingRule(id);
      if (!existingRule) {
        return res.status(404).json({ error: "Shipping rule not found" });
      }
      
      // For update, we allow partial updates but still validate structure when provided
      const validatedUpdates: any = {};
      if (req.body.name) validatedUpdates.name = z.string().min(1).max(255).parse(req.body.name);
      if (req.body.description !== undefined) validatedUpdates.description = z.string().max(2000).optional().parse(req.body.description);
      if (req.body.shippingCharge !== undefined) validatedUpdates.shippingCharge = z.coerce.string().parse(req.body.shippingCharge);
      if (req.body.isEnabled !== undefined) validatedUpdates.isEnabled = z.boolean().parse(req.body.isEnabled);
      if (req.body.priority !== undefined) validatedUpdates.priority = z.number().int().min(0).max(1000000).parse(req.body.priority);
      if (req.body.type) validatedUpdates.type = z.enum(["product_based", "location_value_based", "product_query_based", "location_query_based"]).parse(req.body.type);
      
      // Determine effective type (updated type or existing type)
      const effectiveType = validatedUpdates.type || existingRule.type;
      
      // Validate conditions if provided
      if (req.body.conditions) {
        // Create a schema for validating conditions based on effective type
        const productBasedConditionsSchema = z.object({
          productNames: z.array(z.string().min(1)).optional(),
          categories: z.array(z.string().min(1)).optional(),
          classifications: z.array(z.string().min(1)).optional(),
        }).refine(
          (data) => data.productNames?.length || data.categories?.length || data.classifications?.length,
          { message: "At least one condition is required for product-based rules" }
        );
        
        const locationValueBasedConditionsSchema = z.object({
          pincodes: z.array(z.string().regex(/^\d{6}$/, "PIN code must be 6 digits")).optional(),
          pincodeRanges: z.array(z.object({
            start: z.string().regex(/^\d{6}$/, "Start PIN code must be 6 digits"),
            end: z.string().regex(/^\d{6}$/, "End PIN code must be 6 digits")
          })).optional(),
          minOrderValue: z.coerce.number().min(0).optional(),
          maxOrderValue: z.coerce.number().min(0).optional(),
        }).refine(
          (data) => data.pincodes?.length || data.pincodeRanges?.length || 
                   data.minOrderValue !== undefined || data.maxOrderValue !== undefined,
          { message: "At least one condition is required for location/value-based rules" }
        );
        
        // Import query schemas from shared schema
        const productQueryConditionsSchema = z.object({
          rules: z.array(z.object({
            field: z.enum(["productName", "category", "classification"]),
            operator: z.enum(["IN", "NOT_IN", "BETWEEN", "NOT_BETWEEN", "EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "STARTS_WITH", "ENDS_WITH", "CONTAINS"]),
            values: z.array(z.string()).min(1)
          })).min(1),
          logicalOperator: z.enum(["AND", "OR"]).default("AND")
        });
        
        const locationQueryConditionsSchema = z.object({
          rules: z.array(z.object({
            field: z.enum(["pincode", "orderValue"]),
            operator: z.enum(["IN", "NOT_IN", "BETWEEN", "NOT_BETWEEN", "EQUALS", "NOT_EQUALS", "GREATER_THAN", "LESS_THAN", "STARTS_WITH", "ENDS_WITH", "CONTAINS"]),
            values: z.array(z.string()).min(1)
          })).min(1),
          logicalOperator: z.enum(["AND", "OR"]).default("AND")
        });
        
        if (effectiveType === "product_based") {
          validatedUpdates.conditions = productBasedConditionsSchema.parse(req.body.conditions);
        } else if (effectiveType === "location_value_based") {
          validatedUpdates.conditions = locationValueBasedConditionsSchema.parse(req.body.conditions);
        } else if (effectiveType === "product_query_based") {
          validatedUpdates.conditions = productQueryConditionsSchema.parse(req.body.conditions);
        } else if (effectiveType === "location_query_based") {
          validatedUpdates.conditions = locationQueryConditionsSchema.parse(req.body.conditions);
        } else {
          return res.status(422).json({ error: "Invalid rule type for conditions validation" });
        }
      }
      
      const rule = await storage.updateShippingRule(id, validatedUpdates);
      res.json(rule);
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: "Validation failed", 
          details: error.errors 
        });
      }
      if (error?.message?.includes("not found")) {
        return res.status(404).json({ error: "Shipping rule not found" });
      }
      console.error("Error updating shipping rule:", error);
      res.status(500).json({ error: "Failed to update shipping rule" });
    }
  });

  app.delete("/api/admin/shipping-rules/:id", requireAdmin, async (req, res) => {
    try {
      const idSchema = z.string().uuid();
      const id = idSchema.parse(req.params.id);
      
      await storage.deleteShippingRule(id);
      res.status(204).send();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(422).json({ 
          error: "Invalid ID parameter", 
          details: error.errors 
        });
      }
      console.error("Error deleting shipping rule:", error);
      res.status(500).json({ error: "Failed to delete shipping rule" });
    }
  });

  // Influencer authentication routes
  app.post('/api/influencer/login', async (req, res) => {
    try {
      const { phone, password } = req.body;
      const influencer = await storage.authenticateInfluencer(phone, password);
      if (influencer) {
        req.session.influencerId = influencer.id;
        req.session.userRole = 'influencer';
        res.json({ success: true, influencer: { id: influencer.id, phone: influencer.phone, name: influencer.name } });
      } else {
        res.status(401).json({ message: 'Invalid credentials' });
      }
    } catch (error) {
      console.error('Influencer login error:', error);
      res.status(500).json({ message: 'Login failed' });
    }
  });

  app.post('/api/influencer/logout', (req, res) => {
    req.session.influencerId = undefined;
    req.session.userRole = undefined;
    res.json({ message: 'Logged out successfully' });
  });

  app.get('/api/influencer/me', async (req, res) => {
    if (req.session.influencerId && req.session.userRole === 'influencer') {
      try {
        const influencer = await storage.getInfluencer(req.session.influencerId);
        if (influencer) {
          res.json({ authenticated: true, role: 'influencer', influencer });
        } else {
          res.status(401).json({ authenticated: false });
        }
      } catch (error) {
        console.error('Error fetching influencer:', error);
        res.status(500).json({ authenticated: false });
      }
    } else {
      res.status(401).json({ authenticated: false });
    }
  });


  // Password generation utility
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };



  // Admin management of other admins
  app.get("/api/admin/admins", requireAdmin, async (req, res) => {
    try {
      const admins = await storage.getAdmins();
      res.json(admins);
    } catch (error: any) {
      console.error("Error fetching admins:", error);
      res.status(500).json({ error: error.message || "Failed to fetch admins" });
    }
  });

  app.post("/api/admin/admins", requireAdmin, async (req, res) => {
    try {
      const { name, phone, email, password, username } = req.body;
      const admin = await storage.createAdmin({
        name,
        phone,
        email,
        password: password || undefined,
        username: username || undefined,
      });
      res.json({ admin });
    } catch (error: any) {
      console.error("Error creating admin:", error);
      res.status(500).json({ error: error.message || "Failed to create admin" });
    }
  });

  app.patch("/api/admin/admins/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const admin = await storage.updateAdmin(id, updateData);
      res.json({ admin });
    } catch (error: any) {
      console.error("Error updating admin:", error);
      res.status(500).json({ error: error.message || "Failed to update admin" });
    }
  });

  app.delete("/api/admin/admins/:id", requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteAdmin(id);
      res.json({ message: "Admin removed successfully" });
    } catch (error: any) {
      console.error("Error removing admin:", error);
      res.status(500).json({ error: error.message || "Failed to remove admin" });
    }
  });

  // OTP Authentication routes
  app.post('/api/auth/send-otp', async (req, res) => {
    try {
      const { phone, userType } = req.body;
      
      if (!phone || !userType) {
        return res.status(400).json({ message: 'Phone number and user type are required' });
      }

      if (!['admin', 'buyer', 'influencer'].includes(userType)) {
        return res.status(400).json({ message: 'Invalid user type' });
      }

      const result = await otpService.sendOtp(phone, userType);
      
      if (result.success) {
        res.json({ message: result.message, otpId: result.otpId });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      res.status(500).json({ message: 'Failed to send OTP' });
    }
  });

  app.post('/api/auth/verify-otp', async (req, res) => {
    try {
      const { phone, otp, userType } = req.body;
      
      if (!phone || !otp || !userType) {
        return res.status(400).json({ message: 'Phone number, OTP, and user type are required' });
      }

      const result = await otpService.verifyOtp(phone, otp, userType);
      
      if (result.success && result.user) {
        // Set session based on user type
        switch (userType) {
          case 'admin':
            req.session.adminId = result.user.id;
            req.session.userRole = 'admin';
            break;
          case 'influencer':
            req.session.influencerId = result.user.id;
            req.session.userRole = 'influencer';
            break;
          case 'buyer':
            req.session.userId = result.user.id;
            req.session.userRole = 'buyer';
            break;
        }

        res.json({ 
          message: result.message, 
          user: result.user,
          isNewUser: result.isNewUser 
        });
      } else {
        res.status(400).json({ message: result.message });
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      res.status(500).json({ message: 'Failed to verify OTP' });
    }
  });

  // Password Authentication Route
  app.post('/api/auth/login-password', async (req, res) => {
    try {
      const { phone, password, userType } = req.body;
      
      if (!phone || !password || !userType) {
        return res.status(400).json({ message: 'Phone number, password, and user type are required' });
      }

      if (!['admin', 'buyer', 'influencer'].includes(userType)) {
        return res.status(400).json({ message: 'Invalid user type' });
      }

      // Validate Indian phone number
      const cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length !== 10 || !cleanPhone.match(/^[6-9]\d{9}$/)) {
        return res.status(400).json({ message: 'Please enter a valid Indian phone number' });
      }

      let user = null;

      // Authenticate based on user type
      switch (userType) {
        case 'admin':
          const admin = await storage.authenticateAdmin(cleanPhone, password);
          if (admin) {
            user = admin;
            req.session.adminId = admin.id;
            req.session.userRole = 'admin';
          }
          break;
        
        case 'influencer':
          const influencer = await storage.authenticateInfluencer(cleanPhone, password);
          if (influencer) {
            user = influencer;
            req.session.influencerId = influencer.id;
            req.session.userRole = 'influencer';
          }
          break;
        
        case 'buyer':
          const buyer = await storage.authenticateUser(cleanPhone, password);
          if (buyer) {
            user = buyer;
            req.session.userId = buyer.id;
            req.session.userRole = 'buyer';
          }
          break;
      }

      if (!user) {
        return res.status(401).json({ message: 'Invalid phone number or password' });
      }

      res.json({ 
        message: 'Login successful', 
        user: user
      });

    } catch (error) {
      console.error('Error during password login:', error);
      res.status(500).json({ message: 'Login failed. Please try again.' });
    }
  });

  // Abandoned cart routes
  app.get('/api/abandoned-carts', async (req, res) => {
    try {
      const abandonedCarts = await storage.getAbandonedCarts();
      res.json(abandonedCarts);
    } catch (error) {
      console.error('Error fetching abandoned carts:', error);
      res.status(500).json({ message: 'Failed to fetch abandoned carts' });
    }
  });

  app.post('/api/track-cart-activity', async (req, res) => {
    try {
      const sessionId = req.session.sessionId;
      if (sessionId) {
        await storage.trackCartActivity(sessionId);
      }
      res.json({ message: 'Cart activity tracked' });
    } catch (error) {
      console.error('Error tracking cart activity:', error);
      res.status(500).json({ message: 'Failed to track cart activity' });
    }
  });

  // Analytics routes
  app.get('/api/analytics/popular-products', async (req, res) => {
    try {
      const popularProducts = await storage.getPopularProducts();
      res.json(popularProducts);
    } catch (error) {
      console.error('Error fetching popular products:', error);
      res.status(500).json({ message: 'Failed to fetch popular products' });
    }
  });

  app.get('/api/analytics/sales-trends', async (req, res) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const salesTrends = await storage.getSalesTrends(days);
      res.json(salesTrends);
    } catch (error) {
      console.error('Error fetching sales trends:', error);
      res.status(500).json({ message: 'Failed to fetch sales trends' });
    }
  });

  app.get('/api/analytics/conversion-metrics', async (req, res) => {
    try {
      const conversionMetrics = await storage.getConversionMetrics();
      res.json(conversionMetrics);
    } catch (error) {
      console.error('Error fetching conversion metrics:', error);
      res.status(500).json({ message: 'Failed to fetch conversion metrics' });
    }
  });

  // Seed route for creating test accounts
  app.post('/api/seed-accounts', async (req, res) => {
    try {
      // Create test admin
      const admin = await storage.createAdmin({
        username: 'admin',
        password: 'password123',
        name: 'Admin User',
        email: 'admin@example.com',
        phone: '+919999999999'
      });
      
      res.json({ 
        message: 'Test accounts created successfully!',
        admin: { username: 'admin', password: 'password123' }
      });
    } catch (error) {
      console.error('Error creating accounts:', error);
      res.status(500).json({ message: 'Failed to create accounts' });
    }
  });

  // Calculate shipping charges
  app.post('/api/shipping/calculate', async (req, res) => {
    try {
      const { cartItems, pincode, orderValue } = req.body;

      if (!cartItems || !pincode || orderValue === undefined) {
        return res.status(400).json({ error: 'Missing required fields: cartItems, pincode, orderValue' });
      }

      const shippingCharge = await storage.calculateShippingCharge({
        cartItems,
        pincode,
        orderValue
      });

      res.json({ shippingCharge });
    } catch (error) {
      console.error('Error calculating shipping charge:', error);
      res.status(500).json({ error: 'Failed to calculate shipping charge' });
    }
  });

  // App settings endpoints
  app.get('/api/admin/settings', requireAdmin, async (req, res) => {
    try {
      const settings = await storage.getAppSettings();
      res.json(settings);
    } catch (error) {
      console.error('Error fetching app settings:', error);
      res.status(500).json({ error: 'Failed to fetch app settings' });
    }
  });

  app.put('/api/admin/settings/:key', requireAdmin, async (req, res) => {
    try {
      const { key } = req.params;
      const { value } = req.body;

      if (!value) {
        return res.status(400).json({ error: 'Value is required' });
      }

      const setting = await storage.updateAppSetting(key, value, 'admin');
      res.json(setting);
    } catch (error) {
      console.error('Error updating app setting:', error);
      res.status(500).json({ error: 'Failed to update app setting' });
    }
  });

  // Initialize default app settings
  async function initializeDefaultSettings() {
    try {
      const defaultShippingSetting = await storage.getAppSetting('default_shipping_charge');
      if (!defaultShippingSetting) {
        await storage.createAppSetting({
          key: 'default_shipping_charge',
          value: '50',
          description: 'Default shipping charge when no rules apply',
          category: 'shipping'
        });
        console.log('Default shipping charge setting initialized to ₹50');
      }

      const otpLengthSetting = await storage.getAppSetting('otp_length');
      if (!otpLengthSetting) {
        await storage.createAppSetting({
          key: 'otp_length',
          value: '6',
          description: 'Number of digits in OTP (4-8 digits)',
          category: 'authentication'
        });
        console.log('OTP length setting initialized to 6 digits');
      }

      const smsProviderSetting = await storage.getAppSetting('sms_service_provider');
      if (!smsProviderSetting) {
        await storage.createAppSetting({
          key: 'sms_service_provider',
          value: '2Factor',
          description: 'SMS service provider (Test for mock OTP, 2Factor for real API)',
          category: 'authentication'
        });
        console.log('SMS service provider setting initialized to 2Factor');
      }
    } catch (error) {
      console.error('Error initializing default settings:', error);
    }
  }

  // Initialize settings on startup
  initializeDefaultSettings();

  const httpServer = createServer(app);
  return httpServer;
}
