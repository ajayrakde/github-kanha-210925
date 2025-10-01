import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";

import { ObjectStorageService } from "../objectStorage";

describe("ObjectStorageService", () => {
  const originalPrivateDir = process.env.PRIVATE_OBJECT_DIR;

  beforeEach(() => {
    process.env.PRIVATE_OBJECT_DIR = "/bucket/private";
  });

  afterEach(() => {
    if (originalPrivateDir === undefined) {
      delete process.env.PRIVATE_OBJECT_DIR;
    } else {
      process.env.PRIVATE_OBJECT_DIR = originalPrivateDir;
    }
  });

  it("scopes generated upload keys beneath the private uploads prefix", async () => {
    const getSignedUrl = vi.fn(async () => "signed-url");
    const backend = {
      type: "replit" as const,
      getSignedUrl,
      getFile: vi.fn(),
    };

    const service = new ObjectStorageService(backend);

    const url = await service.getObjectEntityUploadURL();

    expect(url).toBe("signed-url");
    expect(getSignedUrl).toHaveBeenCalledTimes(1);
    const [options] = getSignedUrl.mock.calls[0];
    expect(options.bucketName).toBe("bucket");
    expect(options.objectName.startsWith("private/uploads/")).toBe(true);
    const objectParts = options.objectName.split("/");
    expect(objectParts).toHaveLength(3);
    expect(objectParts[2]).not.toHaveLength(0);
    expect(options.method).toBe("PUT");
    expect(options.ttlSec).toBe(900);
  });
});
