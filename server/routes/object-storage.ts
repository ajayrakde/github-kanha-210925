import { Router } from "express";

export function createObjectStorageRouter() {
  const router = Router();

  router.post("/upload", async (req, res) => {
    try {
      const maxFileSize = 5 * 1024 * 1024;
      const contentLength = parseInt(req.headers["content-length"] || "0");

      if (contentLength > maxFileSize) {
        return res.status(400).json({
          message: `File too large. Maximum size allowed is ${Math.round(
            maxFileSize / (1024 * 1024),
          )}MB`,
        });
      }

      const { ObjectStorageService } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error generating upload URL:", error);
      res.status(500).json({ message: "Failed to generate upload URL" });
    }
  });

  return router;
}

export function createPublicObjectRouter() {
  const router = Router();

  router.get("/:objectPath(*)", async (req, res) => {
    try {
      const { ObjectStorageService } = await import("../objectStorage");
      const objectStorageService = new ObjectStorageService();
      const objectFile = await objectStorageService.getObjectEntityFile(
        `${req.baseUrl}${req.path}`,
      );
      const stream = objectFile.createReadStream();
      stream.pipe(res);
    } catch (error) {
      console.error("Error serving object:", error);
      res.status(404).json({ message: "Object not found" });
    }
  });

  return router;
}
