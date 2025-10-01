import type { Admin, Influencer, User } from "@shared/schema";

export type SerializedBuyer = Omit<User, "password">;
export type SerializedInfluencer = Omit<Influencer, "password">;
export type SerializedAdmin = Omit<Admin, "password">;

type Nullable<T> = T | null | undefined;

const omitPassword = <T extends { password: unknown }>(entity: Nullable<T>): Omit<T, "password"> | null => {
  if (!entity) {
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password, ...safeEntity } = entity;
  return safeEntity;
};

export function serializeBuyer(user: Nullable<User>): SerializedBuyer | null {
  return omitPassword(user);
}

export function serializeInfluencer(influencer: Nullable<Influencer>): SerializedInfluencer | null {
  return omitPassword(influencer);
}

export function serializeAdmin(admin: Nullable<Admin>): SerializedAdmin | null {
  return omitPassword(admin);
}
