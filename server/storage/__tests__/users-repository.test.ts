import bcrypt from "bcryptjs";
import { describe, expect, it, vi } from "vitest";

import { admins, influencers, users } from "@shared/schema";

const mockedDb = vi.hoisted(() => ({
  select: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../db", () => ({
  db: mockedDb,
}));

import { UsersRepository } from "../users";

function createMockDb() {
  const selectWhere = vi
    .fn<[table: unknown, condition: unknown], Promise<any[]>>()
    .mockResolvedValue([]);
  const updateWhere = vi
    .fn<[table: unknown, values: unknown, condition: unknown], Promise<any>>()
    .mockResolvedValue([]);

  const mockDb = {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => ({
        where: (condition: unknown) => selectWhere(table, condition),
      })),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: unknown) => ({
        where: (condition: unknown) => updateWhere(table, values, condition),
      })),
    })),
  } as const;

  return {
    mockDb:
      mockDb as unknown as ConstructorParameters<typeof UsersRepository>[0],
    selectWhere,
    updateWhere,
  };
}

describe("UsersRepository authentication hashing", () => {
  it("authenticates hashed admin passwords without rehashing", async () => {
    const hashedPassword = await bcrypt.hash("secret", 12);
    const { mockDb, selectWhere, updateWhere } = createMockDb();
    selectWhere.mockImplementation(async (table) => {
      if (table === admins) {
        return [
          {
            id: "admin-1",
            phone: "+1000000000",
            password: hashedPassword,
            isActive: true,
          },
        ];
      }
      return [];
    });

    const repository = new UsersRepository(mockDb);

    const result = await repository.authenticateAdmin("+1000000000", "secret");

    expect(result?.id).toBe("admin-1");
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("rehashes legacy plaintext admin passwords on login", async () => {
    const { mockDb, selectWhere, updateWhere } = createMockDb();
    selectWhere.mockImplementation(async (table) => {
      if (table === admins) {
        return [
          {
            id: "admin-2",
            phone: "+1999999999",
            password: "legacy",
            isActive: true,
          },
        ];
      }
      return [];
    });

    const repository = new UsersRepository(mockDb);

    const result = await repository.authenticateAdmin("+1999999999", "legacy");

    expect(result?.id).toBe("admin-2");
    expect(updateWhere).toHaveBeenCalledTimes(1);
    const [, values] = updateWhere.mock.calls[0];
    expect(values.password).toMatch(/^\$2[aby]\$/);
    expect(values.updatedAt).toBeInstanceOf(Date);
    expect(result?.password).toMatch(/^\$2[aby]\$/);
  });

  it("authenticates hashed influencer passwords", async () => {
    const hashedPassword = await bcrypt.hash("opensesame", 12);
    const { mockDb, selectWhere, updateWhere } = createMockDb();
    selectWhere.mockImplementation(async (table) => {
      if (table === influencers) {
        return [
          {
            id: "influencer-1",
            phone: "+1888888888",
            password: hashedPassword,
            isActive: true,
          },
        ];
      }
      return [];
    });

    const repository = new UsersRepository(mockDb);

    const result = await repository.authenticateInfluencer("+1888888888", "opensesame");

    expect(result?.id).toBe("influencer-1");
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("authenticates hashed buyer passwords", async () => {
    const hashedPassword = await bcrypt.hash("buyerpass", 12);
    const { mockDb, selectWhere, updateWhere } = createMockDb();
    selectWhere.mockImplementation(async (table) => {
      if (table === users) {
        return [
          {
            id: "user-1",
            phone: "+1777777777",
            password: hashedPassword,
          },
        ];
      }
      return [];
    });

    const repository = new UsersRepository(mockDb);

    const result = await repository.authenticateUser("+1777777777", "buyerpass");

    expect(result?.id).toBe("user-1");
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("rejects invalid passwords once hashes are stored", async () => {
    const hashedPassword = await bcrypt.hash("correct", 12);
    const { mockDb, selectWhere, updateWhere } = createMockDb();
    selectWhere.mockImplementation(async (table) => {
      if (table === admins) {
        return [
          {
            id: "admin-3",
            phone: "+1666666666",
            password: hashedPassword,
            isActive: true,
          },
        ];
      }
      return [];
    });

    const repository = new UsersRepository(mockDb);

    const result = await repository.authenticateAdmin("+1666666666", "incorrect");

    expect(result).toBeNull();
    expect(updateWhere).not.toHaveBeenCalled();
  });

  it("rejects invalid influencer passwords once hashes are stored", async () => {
    const hashedPassword = await bcrypt.hash("goodpass", 12);
    const { mockDb, selectWhere } = createMockDb();
    selectWhere.mockImplementation(async (table) => {
      if (table === influencers) {
        return [
          {
            id: "influencer-2",
            phone: "+1555555555",
            password: hashedPassword,
            isActive: true,
          },
        ];
      }
      return [];
    });

    const repository = new UsersRepository(mockDb);

    const result = await repository.authenticateInfluencer("+1555555555", "badpass");

    expect(result).toBeNull();
  });
});
