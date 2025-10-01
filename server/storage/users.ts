import {
  users,
  admins,
  influencers,
  userAddresses,
  type User,
  type InsertUser,
  type Admin,
  type InsertAdmin,
  type Influencer,
  type InsertInfluencer,
  type UserAddress,
  type InsertUserAddress,
} from "@shared/schema";
import bcrypt from "bcryptjs";
import { eq, and, desc } from "drizzle-orm";

import { db } from "../db";

const BCRYPT_SALT_ROUNDS = 12;

type PasswordTable = typeof users | typeof admins | typeof influencers;

type PasswordRecord = {
  id: string;
  password: string | null;
};

export class UsersRepository {
  constructor(private readonly database: typeof db = db) {}

  private isBcryptHash(password: string | null | undefined): password is string {
    return typeof password === "string" && password.startsWith("$2");
  }

  private async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
  }

  private async preparePasswordForWrite(
    password: string | null | undefined,
  ): Promise<string | null | undefined> {
    if (password === undefined) {
      return undefined;
    }

    if (password === null) {
      return null;
    }

    if (!password) {
      return password;
    }

    if (this.isBcryptHash(password)) {
      return password;
    }

    return this.hashPassword(password);
  }

  private async verifyPassword(
    record: PasswordRecord,
    plainText: string,
    table: PasswordTable,
  ): Promise<boolean> {
    if (!record.password) {
      return false;
    }

    if (this.isBcryptHash(record.password)) {
      return bcrypt.compare(plainText, record.password);
    }

    if (record.password === plainText) {
      const hashed = await this.hashPassword(plainText);
      await this.database
        .update(table)
        .set({ password: hashed, updatedAt: new Date() })
        .where(eq(table.id, record.id));
      record.password = hashed;
      return true;
    }

    return false;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.id, id));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await this.database
      .select()
      .from(users)
      .where(eq(users.phone, phone));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const values: InsertUser = { ...user };
    if (user.password !== undefined) {
      values.password = (await this.preparePasswordForWrite(
        user.password,
      )) as typeof values.password;
    }

    const [createdUser] = await this.database
      .insert(users)
      .values(values)
      .returning();
    return createdUser;
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User> {
    const updateData: Partial<InsertUser> & { updatedAt: Date } = {
      ...user,
      updatedAt: new Date(),
    };

    if (user.password !== undefined) {
      updateData.password = (await this.preparePasswordForWrite(
        user.password,
      )) as typeof updateData.password;
    }

    const [updatedUser] = await this.database
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async authenticateUser(phone: string, password: string): Promise<User | null> {
    if (!password) return null;
    try {
      const [user] = await this.database
        .select()
        .from(users)
        .where(eq(users.phone, phone));
      if (user && (await this.verifyPassword(user, password, users))) {
        return user;
      }
      return null;
    } catch (error) {
      console.error("Error authenticating user:", error);
      return null;
    }
  }

  async getAdmins(): Promise<Admin[]> {
    return await this.database
      .select()
      .from(admins)
      .where(eq(admins.isActive, true));
  }

  async getAdmin(id: string): Promise<Admin | undefined> {
    const [admin] = await this.database
      .select()
      .from(admins)
      .where(eq(admins.id, id));
    return admin;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    const [admin] = await this.database
      .select()
      .from(admins)
      .where(eq(admins.username, username));
    return admin;
  }

  async getAdminByPhone(phone: string): Promise<Admin | undefined> {
    const [admin] = await this.database
      .select()
      .from(admins)
      .where(eq(admins.phone, phone));
    return admin;
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    const values: InsertAdmin = { ...admin };
    if (admin.password !== undefined) {
      values.password = (await this.preparePasswordForWrite(
        admin.password,
      )) as typeof values.password;
    }

    const [createdAdmin] = await this.database
      .insert(admins)
      .values(values)
      .returning();
    return createdAdmin;
  }

  async updateAdmin(id: string, admin: Partial<InsertAdmin>): Promise<Admin> {
    const updateData: Partial<InsertAdmin> & { updatedAt: Date } = {
      ...admin,
      updatedAt: new Date(),
    };

    if (admin.password !== undefined) {
      updateData.password = (await this.preparePasswordForWrite(
        admin.password,
      )) as typeof updateData.password;
    }

    const [updatedAdmin] = await this.database
      .update(admins)
      .set(updateData)
      .where(eq(admins.id, id))
      .returning();
    return updatedAdmin;
  }

  async deleteAdmin(id: string): Promise<void> {
    await this.database
      .update(admins)
      .set({ isActive: false })
      .where(eq(admins.id, id));
  }

  async deactivateAdmin(id: string): Promise<void> {
    await this.database
      .update(admins)
      .set({ isActive: false })
      .where(eq(admins.id, id));
  }

  async validateAdminLogin(username: string, password: string): Promise<Admin | null> {
    if (!password) {
      return null;
    }

    const admin = await this.getAdminByUsername(username);
    if (!admin || !admin.isActive) {
      return null;
    }

    const isValid = await this.verifyPassword(admin, password, admins);
    return isValid ? admin : null;
  }

  async authenticateAdmin(phone: string, password: string): Promise<Admin | null> {
    if (!password) return null;
    try {
      const [admin] = await this.database
        .select()
        .from(admins)
        .where(eq(admins.phone, phone));
      if (admin && admin.isActive && (await this.verifyPassword(admin, password, admins))) {
        return admin;
      }
      return null;
    } catch (error) {
      console.error("Error authenticating admin:", error);
      return null;
    }
  }

  async getInfluencers(): Promise<Influencer[]> {
    return await this.database
      .select()
      .from(influencers)
      .orderBy(desc(influencers.createdAt));
  }

  async getInfluencer(id: string): Promise<Influencer | undefined> {
    const [influencer] = await this.database
      .select()
      .from(influencers)
      .where(eq(influencers.id, id));
    return influencer;
  }

  async getInfluencerByPhone(phone: string): Promise<Influencer | undefined> {
    const [influencer] = await this.database
      .select()
      .from(influencers)
      .where(eq(influencers.phone, phone));
    return influencer;
  }

  async createInfluencer(influencer: InsertInfluencer): Promise<Influencer> {
    const values: InsertInfluencer = { ...influencer };
    if (influencer.password !== undefined) {
      values.password = (await this.preparePasswordForWrite(
        influencer.password,
      )) as typeof values.password;
    }

    const [createdInfluencer] = await this.database
      .insert(influencers)
      .values(values)
      .returning();
    return createdInfluencer;
  }

  async updateInfluencer(
    id: string,
    influencer: Partial<InsertInfluencer>,
  ): Promise<Influencer> {
    const updateData: Partial<InsertInfluencer> & { updatedAt: Date } = {
      ...influencer,
      updatedAt: new Date(),
    };

    if (influencer.password !== undefined) {
      updateData.password = (await this.preparePasswordForWrite(
        influencer.password,
      )) as typeof updateData.password;
    }

    const [updatedInfluencer] = await this.database
      .update(influencers)
      .set(updateData)
      .where(eq(influencers.id, id))
      .returning();
    return updatedInfluencer;
  }

  async deleteInfluencer(id: string): Promise<void> {
    await this.database
      .update(influencers)
      .set({ isActive: false })
      .where(eq(influencers.id, id));
  }

  async deactivateInfluencer(id: string): Promise<void> {
    await this.database
      .update(influencers)
      .set({ isActive: false })
      .where(eq(influencers.id, id));
  }

  async authenticateInfluencer(
    phone: string,
    password: string,
  ): Promise<Influencer | null> {
    if (!password) return null;
    try {
      const [influencer] = await this.database
        .select()
        .from(influencers)
        .where(eq(influencers.phone, phone));
      if (
        influencer &&
        influencer.isActive &&
        (await this.verifyPassword(influencer, password, influencers))
      ) {
        return influencer;
      }
      return null;
    } catch (error) {
      console.error("Error authenticating influencer:", error);
      return null;
    }
  }

  async getUserAddresses(userId: string): Promise<UserAddress[]> {
    return await this.database
      .select()
      .from(userAddresses)
      .where(eq(userAddresses.userId, userId))
      .orderBy(desc(userAddresses.isPreferred), userAddresses.createdAt);
  }

  async createUserAddress(address: InsertUserAddress): Promise<UserAddress> {
    const [createdAddress] = await this.database
      .insert(userAddresses)
      .values(address)
      .returning();
    return createdAddress;
  }

  async updateUserAddress(
    id: string,
    address: Partial<InsertUserAddress>,
  ): Promise<UserAddress> {
    const [updatedAddress] = await this.database
      .update(userAddresses)
      .set({ ...address, updatedAt: new Date() })
      .where(eq(userAddresses.id, id))
      .returning();
    return updatedAddress;
  }

  async deleteUserAddress(id: string, userId: string): Promise<void> {
    await this.database
      .delete(userAddresses)
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)));
  }

  async setPreferredAddress(userId: string, addressId: string): Promise<void> {
    await this.database
      .update(userAddresses)
      .set({ isPreferred: false })
      .where(eq(userAddresses.userId, userId));

    await this.database
      .update(userAddresses)
      .set({ isPreferred: true })
      .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)));
  }

  async getPreferredAddress(userId: string): Promise<UserAddress | undefined> {
    const [address] = await this.database
      .select()
      .from(userAddresses)
      .where(and(eq(userAddresses.userId, userId), eq(userAddresses.isPreferred, true)))
      .limit(1);
    return address;
  }
}
