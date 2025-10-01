import type { Admin, Influencer, User } from "@shared/schema";

export type SerializedBuyer = Omit<User, "password">;
export type SerializedInfluencer = Omit<Influencer, "password">;
export type SerializedAdmin = Omit<Admin, "password">;

type EntityWithPassword = { password: string | null | undefined };

function omitPassword<T extends EntityWithPassword>(entity: T): Omit<T, "password"> {
  const { password: _password, ...rest } = entity;
  return rest;
}

export function serializeBuyer(buyer: User): SerializedBuyer;
export function serializeBuyer(buyer: null | undefined): null | undefined;
export function serializeBuyer(
  buyer: User | null | undefined,
): SerializedBuyer | null | undefined {
  if (buyer == null) {
    return buyer;
  }

  return omitPassword(buyer);
}

export function serializeInfluencer(influencer: Influencer): SerializedInfluencer;
export function serializeInfluencer(
  influencer: null | undefined,
): null | undefined;
export function serializeInfluencer(
  influencer: Influencer | null | undefined,
): SerializedInfluencer | null | undefined {
  if (influencer == null) {
    return influencer;
  }

  return omitPassword(influencer);
}

export function serializeAdmin(admin: Admin): SerializedAdmin;
export function serializeAdmin(admin: null | undefined): null | undefined;
export function serializeAdmin(
  admin: Admin | null | undefined,
): SerializedAdmin | null | undefined {
  if (admin == null) {
    return admin;
  }

  return omitPassword(admin);
}
