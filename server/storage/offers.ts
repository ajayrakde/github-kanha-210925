import {
  offers,
  offerRedemptions,
  influencers,
  type Offer,
  type InsertOffer,
  type OfferRedemption,
  type Influencer,
} from "@shared/schema";
import { db } from "../db";
import { eq, desc, sql, and } from "drizzle-orm";

export class OffersRepository {
  async getOffers(): Promise<(Offer & { influencer: Influencer | null })[]> {
    return await db.query.offers.findMany({
      with: {
        influencer: true,
      },
      orderBy: desc(offers.createdAt),
    });
  }

  async getOfferByCode(code: string): Promise<Offer | undefined> {
    const [offer] = await db.select().from(offers).where(eq(offers.code, code.toUpperCase()));
    return offer;
  }

  async createOffer(offer: InsertOffer): Promise<Offer> {
    const [createdOffer] = await db
      .insert(offers)
      .values({
        ...offer,
        code: offer.code.toUpperCase(),
      })
      .returning();
    return createdOffer;
  }

  async updateOffer(id: string, offer: Partial<InsertOffer>): Promise<Offer> {
    const updateData = { ...offer };
    if (updateData.code) {
      updateData.code = updateData.code.toUpperCase();
    }
    const [updatedOffer] = await db
      .update(offers)
      .set(updateData)
      .where(eq(offers.id, id))
      .returning();
    return updatedOffer;
  }

  async deleteOffer(id: string): Promise<void> {
    await db.delete(offers).where(eq(offers.id, id));
  }

  async validateOffer(
    code: string,
    userId: string | null,
    cartValue: number,
  ): Promise<{ valid: boolean; offer?: Offer; message?: string }> {
    const offer = await this.getOfferByCode(code);

    if (!offer) {
      return { valid: false, message: "Invalid coupon code" };
    }

    if (!offer.isActive) {
      return { valid: false, message: "This coupon is no longer active" };
    }

    const now = new Date();
    if (offer.startDate && offer.startDate > now) {
      return { valid: false, message: "Coupon is not yet active" };
    }

    if (offer.endDate && offer.endDate < now) {
      return { valid: false, message: "Coupon has expired" };
    }

    if (offer.minCartValue && cartValue < parseFloat(offer.minCartValue)) {
      return { valid: false, message: `Minimum cart value of ₹${offer.minCartValue} required` };
    }

    if (offer.globalUsageLimit && (offer.currentUsage || 0) >= offer.globalUsageLimit) {
      return { valid: false, message: "Coupon usage limit reached" };
    }

    if (offer.perUserUsageLimit && userId) {
      const userRedemptions = await this.getOfferRedemptionsByUser(userId, offer.id);
      if (userRedemptions.length >= offer.perUserUsageLimit) {
        return { valid: false, message: "You have already used this coupon maximum times" };
      }
    }

    return { valid: true, offer };
  }

  async incrementOfferUsage(offerId: string): Promise<void> {
    await db
      .update(offers)
      .set({ currentUsage: sql`${offers.currentUsage} + 1` })
      .where(eq(offers.id, offerId));
  }

  async createOfferRedemption(
    redemption: Omit<OfferRedemption, "id" | "createdAt">
  ): Promise<OfferRedemption> {
    const [createdRedemption] = await db.insert(offerRedemptions).values(redemption).returning();
    return createdRedemption;
  }

  async getOfferRedemptionsByUser(userId: string, offerId: string): Promise<OfferRedemption[]> {
    return await db
      .select()
      .from(offerRedemptions)
      .where(and(eq(offerRedemptions.userId, userId), eq(offerRedemptions.offerId, offerId)));
  }
}
