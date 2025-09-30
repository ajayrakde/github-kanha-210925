import { UsersRepository } from "./users";
import { ProductsRepository } from "./products";
import { OffersRepository } from "./offers";
import { OrdersRepository } from "./orders";
import { SettingsRepository } from "./settings";
import { ShippingRepository } from "./shipping";
import { phonePePollingStore, PhonePePollingStore } from "./phonepe-polling";
// import { PaymentsRepository } from "./payments"; // Temporarily commented during payment system refactor

export const settingsRepository = new SettingsRepository();
export const usersRepository = new UsersRepository();
export const productsRepository = new ProductsRepository();
export const offersRepository = new OffersRepository();
export const ordersRepository = new OrdersRepository();
export const shippingRepository = new ShippingRepository(settingsRepository);
export { phonePePollingStore };
// export const paymentsRepository = new PaymentsRepository(); // Temporarily commented during payment system refactor

export type {
  UsersRepository,
  ProductsRepository,
  OffersRepository,
  OrdersRepository,
  SettingsRepository,
  ShippingRepository,
  PhonePePollingStore,
  // PaymentsRepository, // Temporarily commented during payment system refactor
};
