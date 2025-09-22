import { UsersRepository } from "./users";
import { ProductsRepository } from "./products";
import { OffersRepository } from "./offers";
import { OrdersRepository } from "./orders";
import { SettingsRepository } from "./settings";
import { ShippingRepository } from "./shipping";

export const settingsRepository = new SettingsRepository();
export const usersRepository = new UsersRepository();
export const productsRepository = new ProductsRepository();
export const offersRepository = new OffersRepository();
export const ordersRepository = new OrdersRepository();
export const shippingRepository = new ShippingRepository(settingsRepository);

export type {
  UsersRepository,
  ProductsRepository,
  OffersRepository,
  OrdersRepository,
  SettingsRepository,
  ShippingRepository,
};
