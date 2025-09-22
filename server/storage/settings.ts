import {
  appSettings,
  type AppSettings,
  type InsertAppSettings,
} from "@shared/schema";
import { db } from "../db";
import { eq } from "drizzle-orm";

export class SettingsRepository {
  async getAppSettings(): Promise<AppSettings[]> {
    return await db.select().from(appSettings).orderBy(appSettings.category, appSettings.key);
  }

  async getAppSetting(key: string): Promise<AppSettings | undefined> {
    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, key));
    return setting;
  }

  async updateAppSetting(key: string, value: string, updatedBy?: string): Promise<AppSettings> {
    const [updated] = await db
      .update(appSettings)
      .set({
        value,
        updatedBy,
        updatedAt: new Date(),
      })
      .where(eq(appSettings.key, key))
      .returning();

    if (!updated) {
      throw new Error(`Setting with key "${key}" not found`);
    }

    return updated;
  }

  async createAppSetting(setting: InsertAppSettings): Promise<AppSettings> {
    const [created] = await db.insert(appSettings).values(setting).returning();
    return created;
  }
}
