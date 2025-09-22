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
import { db } from "../db";
import { eq, and, desc } from "drizzle-orm";

export class UsersRepository {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.phone, phone));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [createdUser] = await db.insert(users).values(user).returning();
    return createdUser;
  }

  async updateUser(id: string, user: Partial<InsertUser>): Promise<User> {
    const [updatedUser] = await db
      .update(users)
      .set({ ...user, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return updatedUser;
  }

  async authenticateUser(phone: string, password: string): Promise<User | null> {
    if (!password) return null;
    try {
      const [user] = await db.select().from(users).where(eq(users.phone, phone));
      if (user && user.password === password) {
        return user;
      }
      return null;
    } catch (error) {
      console.error("Error authenticating user:", error);
      return null;
    }
  }

  async getAdmins(): Promise<Admin[]> {
    return await db.select().from(admins).where(eq(admins.isActive, true));
  }

  async getAdmin(id: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.id, id));
    return admin;
  }

  async getAdminByUsername(username: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.username, username));
    return admin;
  }

  async getAdminByPhone(phone: string): Promise<Admin | undefined> {
    const [admin] = await db.select().from(admins).where(eq(admins.phone, phone));
    return admin;
  }

  async createAdmin(admin: InsertAdmin): Promise<Admin> {
    const [createdAdmin] = await db.insert(admins).values(admin).returning();
    return createdAdmin;
  }

  async updateAdmin(id: string, admin: Partial<InsertAdmin>): Promise<Admin> {
    const [updatedAdmin] = await db
      .update(admins)
      .set({ ...admin, updatedAt: new Date() })
      .where(eq(admins.id, id))
      .returning();
    return updatedAdmin;
  }

  async deleteAdmin(id: string): Promise<void> {
    await db.update(admins).set({ isActive: false }).where(eq(admins.id, id));
  }

  async deactivateAdmin(id: string): Promise<void> {
    await db.update(admins).set({ isActive: false }).where(eq(admins.id, id));
  }

  async validateAdminLogin(username: string, password: string): Promise<Admin | null> {
    const admin = await this.getAdminByUsername(username);
    if (admin && admin.password === password && admin.isActive) {
      return admin;
    }
    return null;
  }

  async authenticateAdmin(phone: string, password: string): Promise<Admin | null> {
    if (!password) return null;
    try {
      const [admin] = await db.select().from(admins).where(eq(admins.phone, phone));
      if (admin && admin.password === password && admin.isActive) {
        return admin;
      }
      return null;
    } catch (error) {
      console.error("Error authenticating admin:", error);
      return null;
    }
  }

  async getInfluencers(): Promise<Influencer[]> {
    return await db.select().from(influencers).orderBy(desc(influencers.createdAt));
  }

  async getInfluencer(id: string): Promise<Influencer | undefined> {
    const [influencer] = await db.select().from(influencers).where(eq(influencers.id, id));
    return influencer;
  }

  async getInfluencerByPhone(phone: string): Promise<Influencer | undefined> {
    const [influencer] = await db.select().from(influencers).where(eq(influencers.phone, phone));
    return influencer;
  }

  async createInfluencer(influencer: InsertInfluencer): Promise<Influencer> {
    const [createdInfluencer] = await db.insert(influencers).values(influencer).returning();
    return createdInfluencer;
  }

  async updateInfluencer(id: string, influencer: Partial<InsertInfluencer>): Promise<Influencer> {
    const [updatedInfluencer] = await db
      .update(influencers)
      .set({ ...influencer, updatedAt: new Date() })
      .where(eq(influencers.id, id))
      .returning();
    return updatedInfluencer;
  }

  async deleteInfluencer(id: string): Promise<void> {
    await db.update(influencers).set({ isActive: false }).where(eq(influencers.id, id));
  }

  async deactivateInfluencer(id: string): Promise<void> {
    await db.update(influencers).set({ isActive: false }).where(eq(influencers.id, id));
  }

  async authenticateInfluencer(phone: string, password: string): Promise<Influencer | null> {
    if (!password) return null;
    try {
      const [influencer] = await db.select().from(influencers).where(eq(influencers.phone, phone));
      if (influencer && influencer.password === password && influencer.isActive) {
        return influencer;
      }
      return null;
    } catch (error) {
      console.error("Error authenticating influencer:", error);
      return null;
    }
  }

  async getUserAddresses(userId: string): Promise<UserAddress[]> {
    return await db
      .select()
      .from(userAddresses)
      .where(eq(userAddresses.userId, userId))
      .orderBy(desc(userAddresses.isPreferred), userAddresses.createdAt);
  }

  async createUserAddress(address: InsertUserAddress): Promise<UserAddress> {
    const [createdAddress] = await db.insert(userAddresses).values(address).returning();
    return createdAddress;
  }

  async updateUserAddress(id: string, address: Partial<InsertUserAddress>): Promise<UserAddress> {
    const [updatedAddress] = await db
      .update(userAddresses)
      .set({ ...address, updatedAt: new Date() })
      .where(eq(userAddresses.id, id))
      .returning();
    return updatedAddress;
  }

  async deleteUserAddress(id: string, userId: string): Promise<void> {
    await db
      .delete(userAddresses)
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)));
  }

  async setPreferredAddress(userId: string, addressId: string): Promise<void> {
    await db
      .update(userAddresses)
      .set({ isPreferred: false })
      .where(eq(userAddresses.userId, userId));

    await db
      .update(userAddresses)
      .set({ isPreferred: true })
      .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId)));
  }

  async getPreferredAddress(userId: string): Promise<UserAddress | undefined> {
    const [address] = await db
      .select()
      .from(userAddresses)
      .where(and(eq(userAddresses.userId, userId), eq(userAddresses.isPreferred, true)))
      .limit(1);
    return address;
  }
}
