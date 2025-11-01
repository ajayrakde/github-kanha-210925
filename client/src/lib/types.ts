// Product types
export interface Product {
  id: string;
  name: string;
  brand?: string | null;
  classification?: string | null;
  category?: string | null;
  description: string | null;
  price: string;
  imageUrl: string | null;
  images?: string[] | null;
  displayImageUrl?: string | null;
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// Cart types
export interface CartItem {
  id: string;
  sessionId: string;
  productId: string;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface CartItemWithProduct extends CartItem {
  product: Product;
}

// User types
export interface User {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  pincode: string | null;
  createdAt: string;
  updatedAt: string;
}

// Order types
export interface Order {
  id: string;
  userId: string;
  status: string;
  subtotal: string;
  discountAmount: string;
  total: string;
  offerId: string | null;
  paymentMethod: string | null;
  paymentStatus: string;
  deliveryAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  price: string;
}

export interface OrderWithDetails extends Order {
  user: User;
  items: (OrderItem & { product: Product })[];
  offer?: Offer;
}

// Influencer types
export interface Influencer {
  id: string;
  name: string;
  username: string;
  email: string | null;
  phone: string | null;
  createdAt: string;
}

// Offer types
export interface Offer {
  id: string;
  code: string;
  name: string | null;
  discountType: string;
  discountValue: string;
  maxDiscount: string | null;
  minCartValue: string;
  globalUsageLimit: number | null;
  perUserUsageLimit: number;
  currentUsage: number;
  isActive: boolean;
  startDate: string | null;
  endDate: string | null;
  influencerId: string | null;
  commissionType?: "percentage" | "flat" | null;
  commissionValue?: string | null;
  commissionEarned?: string;
  uniqueCustomers?: number;
  redemptionCount?: number;
  orderCount?: number;
  averageOrderValue?: string;
  createdAt: string;
}

export interface OfferWithInfluencer extends Offer {
  influencer?: Influencer;
}

// API Response types
export interface ApiResponse<T> {
  data?: T;
  message?: string;
  error?: string;
}

// Stats types
export interface InfluencerStats {
  totalOrders: number;
  totalSales: number;
  totalDiscount: number;
  conversionRate: number;
}

export interface AdminStats {
  totalOrders: number;
  revenue: number;
  pendingOrders: number;
  cancelledOrders: number;
}

// Form types
export interface CheckoutFormData {
  name: string;
  email: string;
  address: string;
  city: string;
  pincode: string;
}

export interface OTPVerificationData {
  phone: string;
  otp: string;
}

// Abandoned cart types
export interface AbandonedCart {
  sessionId: string;
  items: number;
  totalValue: number;
  lastActivity: Date;
}

// Analytics types
export interface PopularProduct {
  product: Product;
  orderCount: number;
  totalRevenue: number;
}

export interface SalesTrend {
  date: string;
  orders: number;
  revenue: number;
}

export interface ConversionMetrics {
  registeredUsers: number;
  monthlyActiveUsers: number;
  ordersCompleted: number;
  conversionRate: number;
  averageOrderValue: number;
}
