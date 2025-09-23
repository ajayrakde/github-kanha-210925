import { Storage, File } from "@google-cloud/storage";
import { randomUUID } from "crypto";
import { Readable } from "stream";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getS3SignedUrl } from "@aws-sdk/s3-request-presigner";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

type StorageMethod = "GET" | "PUT" | "DELETE" | "HEAD";
type StorageBackendType = "replit" | "gcs" | "s3";

interface SignedUrlOptions {
  bucketName: string;
  objectName: string;
  method: StorageMethod;
  ttlSec: number;
  contentType?: string;
}

export interface ObjectFileHandle {
  createReadStream(): Promise<NodeJS.ReadableStream>;
}

interface ObjectStorageBackend {
  type: StorageBackendType;
  getSignedUrl(options: SignedUrlOptions): Promise<string>;
  getFile(bucketName: string, objectName: string): Promise<ObjectFileHandle>;
}

class GCSObjectFile implements ObjectFileHandle {
  constructor(private readonly file: File) {}

  async createReadStream(): Promise<NodeJS.ReadableStream> {
    return this.file.createReadStream();
  }
}

class GoogleCloudStorageBackend implements ObjectStorageBackend {
  constructor(
    private readonly storage: Storage,
    public readonly type: StorageBackendType,
    private readonly signer?: (options: SignedUrlOptions) => Promise<string>,
  ) {}

  async getSignedUrl(options: SignedUrlOptions): Promise<string> {
    if (this.signer) {
      return this.signer(options);
    }

    const bucket = this.storage.bucket(options.bucketName);
    const file = bucket.file(options.objectName);
    const [signedURL] = await file.getSignedUrl({
      action: mapMethodToGCSAction(options.method),
      expires: Date.now() + options.ttlSec * 1000,
      contentType: options.contentType,
    });
    return signedURL;
  }

  async getFile(bucketName: string, objectName: string): Promise<ObjectFileHandle> {
    const bucket = this.storage.bucket(bucketName);
    const file = bucket.file(objectName);
    const [exists] = await file.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return new GCSObjectFile(file);
  }
}

class S3ObjectFile implements ObjectFileHandle {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly key: string,
  ) {}

  async createReadStream(): Promise<NodeJS.ReadableStream> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
      );
      const body = response.Body;
      if (!body) {
        throw new ObjectNotFoundError();
      }
      if (body instanceof Readable) {
        return body;
      }

      const sdkBody = body as unknown;
      if (
        typeof sdkBody === "object" &&
        sdkBody !== null &&
        "transformToWebStream" in sdkBody &&
        typeof (sdkBody as { transformToWebStream: () => ReadableStream<Uint8Array> })
          .transformToWebStream === "function"
      ) {
        const webStream = (sdkBody as {
          transformToWebStream: () => ReadableStream<Uint8Array>;
        }).transformToWebStream();
        if (typeof Readable.fromWeb === "function") {
          return Readable.fromWeb(webStream as unknown as NodeReadableStream);
        }
        return Readable.from(webStream as unknown as AsyncIterable<Uint8Array>);
      }

      if (
        typeof sdkBody === "object" &&
        sdkBody !== null &&
        Symbol.asyncIterator in sdkBody &&
        typeof (sdkBody as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === "function"
      ) {
        return Readable.from(sdkBody as AsyncIterable<Uint8Array>);
      }

      throw new Error("Unsupported response body type from S3");
    } catch (error) {
      if (isS3NotFoundError(error)) {
        throw new ObjectNotFoundError();
      }
      throw error;
    }
  }
}

class S3StorageBackend implements ObjectStorageBackend {
  readonly type: StorageBackendType = "s3";

  constructor(private readonly client: S3Client) {}

  async getSignedUrl(options: SignedUrlOptions): Promise<string> {
    const expiresIn = options.ttlSec;
    switch (options.method) {
      case "PUT": {
        const command = new PutObjectCommand({
          Bucket: options.bucketName,
          Key: options.objectName,
          ContentType: options.contentType,
        });
        return getS3SignedUrl(this.client, command, { expiresIn });
      }
      case "GET": {
        const command = new GetObjectCommand({
          Bucket: options.bucketName,
          Key: options.objectName,
        });
        return getS3SignedUrl(this.client, command, { expiresIn });
      }
      case "DELETE": {
        const command = new DeleteObjectCommand({
          Bucket: options.bucketName,
          Key: options.objectName,
        });
        return getS3SignedUrl(this.client, command, { expiresIn });
      }
      case "HEAD": {
        const command = new HeadObjectCommand({
          Bucket: options.bucketName,
          Key: options.objectName,
        });
        return getS3SignedUrl(this.client, command, { expiresIn });
      }
      default:
        throw new Error(`Unsupported method ${options.method} for S3 signed URLs`);
    }
  }

  async getFile(bucketName: string, objectName: string): Promise<ObjectFileHandle> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: bucketName, Key: objectName }),
      );
    } catch (error) {
      if (isS3NotFoundError(error)) {
        throw new ObjectNotFoundError();
      }
      throw error;
    }

    return new S3ObjectFile(this.client, bucketName, objectName);
  }
}

let backendPromise: Promise<ObjectStorageBackend> | null = null;

async function getObjectStorageBackend(): Promise<ObjectStorageBackend> {
  if (!backendPromise) {
    backendPromise = initializeBackend();
  }
  return backendPromise;
}

async function initializeBackend(): Promise<ObjectStorageBackend> {
  const provider = process.env.OBJECT_STORAGE_PROVIDER?.toLowerCase();

  switch (provider) {
    case "replit": {
      if (await isReplitSidecarAvailable()) {
        return createReplitBackend();
      }
      console.warn(
        "OBJECT_STORAGE_PROVIDER=replit but the Replit sidecar is unavailable. Falling back to environment credentials if provided.",
      );
      break;
    }
    case "gcs": {
      if (!hasManualGcsCredentials()) {
        throw new Error(
          "OBJECT_STORAGE_PROVIDER=gcs but required environment variables are missing.",
        );
      }
      return createManualGcsBackend();
    }
    case "s3": {
      if (!hasS3Credentials()) {
        throw new Error(
          "OBJECT_STORAGE_PROVIDER=s3 but required environment variables are missing.",
        );
      }
      return createS3Backend();
    }
    case undefined:
      break;
    default:
      throw new Error(`Unsupported OBJECT_STORAGE_PROVIDER value: ${provider}`);
  }

  if (await isReplitSidecarAvailable()) {
    return createReplitBackend();
  }

  if (hasManualGcsCredentials()) {
    return createManualGcsBackend();
  }

  if (hasS3Credentials()) {
    return createS3Backend();
  }

  throw new Error(
    "Replit object storage sidecar unavailable and no fallback credentials configured. Set OBJECT_STORAGE_PROVIDER and related environment variables to use GCS or S3.",
  );
}

function hasManualGcsCredentials(): boolean {
  return Boolean(
    process.env.OBJECT_STORAGE_GCS_PROJECT_ID &&
      process.env.OBJECT_STORAGE_GCS_CLIENT_EMAIL &&
      process.env.OBJECT_STORAGE_GCS_PRIVATE_KEY,
  );
}

function hasS3Credentials(): boolean {
  return Boolean(
    process.env.OBJECT_STORAGE_S3_ACCESS_KEY_ID &&
      process.env.OBJECT_STORAGE_S3_SECRET_ACCESS_KEY &&
      process.env.OBJECT_STORAGE_S3_REGION,
  );
}

function createReplitBackend(): ObjectStorageBackend {
  return new GoogleCloudStorageBackend(createReplitStorageClient(), "replit", signObjectUrlWithSidecar);
}

function createManualGcsBackend(): ObjectStorageBackend {
  const storage = new Storage({
    projectId: assertEnv("OBJECT_STORAGE_GCS_PROJECT_ID"),
    credentials: {
      client_email: assertEnv("OBJECT_STORAGE_GCS_CLIENT_EMAIL"),
      private_key: normalizePrivateKey(assertEnv("OBJECT_STORAGE_GCS_PRIVATE_KEY")),
    },
  });
  return new GoogleCloudStorageBackend(storage, "gcs");
}

function createS3Backend(): ObjectStorageBackend {
  const client = new S3Client({
    region: assertEnv("OBJECT_STORAGE_S3_REGION"),
    credentials: {
      accessKeyId: assertEnv("OBJECT_STORAGE_S3_ACCESS_KEY_ID"),
      secretAccessKey: assertEnv("OBJECT_STORAGE_S3_SECRET_ACCESS_KEY"),
    },
    endpoint: process.env.OBJECT_STORAGE_S3_ENDPOINT,
    forcePathStyle: parseOptionalBoolean(process.env.OBJECT_STORAGE_S3_FORCE_PATH_STYLE),
  });
  return new S3StorageBackend(client);
}

function createReplitStorageClient(): Storage {
  return new Storage({
    credentials: {
      audience: "replit",
      subject_token_type: "access_token",
      token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
      type: "external_account",
      credential_source: {
        url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
        format: {
          type: "json",
          subject_token_field_name: "access_token",
        },
      },
      universe_domain: "googleapis.com",
    },
    projectId: "",
  });
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return undefined;
  }
  return ["1", "true", "yes", "on"].includes(normalized);
}

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function normalizePrivateKey(key: string): string {
  return key.replace(/\\n/g, "\n");
}

async function isReplitSidecarAvailable(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(
      `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
      1000,
    );
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function mapMethodToGCSAction(method: StorageMethod): "read" | "write" | "delete" {
  switch (method) {
    case "GET":
    case "HEAD":
      return "read";
    case "PUT":
      return "write";
    case "DELETE":
      return "delete";
    default:
      throw new Error(`Unsupported method ${method} for GCS signed URLs`);
  }
}

function isS3NotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const err = error as {
    name?: string;
    Code?: string;
    $metadata?: { httpStatusCode?: number };
  };
  return (
    err.name === "NoSuchKey" ||
    err.name === "NotFound" ||
    err.Code === "NoSuchKey" ||
    err.$metadata?.httpStatusCode === 404
  );
}

function ensureLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

function ensureTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function joinObjectPath(base: string, relative: string): string {
  const normalizedBase = ensureTrailingSlash(ensureLeadingSlash(base));
  const trimmedRelative = relative.startsWith("/") ? relative.slice(1) : relative;
  return `${normalizedBase}${trimmedRelative}`;
}

function addLeadingSlash(path: string): string {
  return path.startsWith("/") ? path : `/${path}`;
}

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  private readonly backendPromise: Promise<ObjectStorageBackend>;

  constructor(backend?: ObjectStorageBackend | Promise<ObjectStorageBackend>) {
    this.backendPromise = backend ? Promise.resolve(backend) : getObjectStorageBackend();
  }

  async getBackendType(): Promise<StorageBackendType> {
    const backend = await this.backendPromise;
    return backend.type;
  }

  // Gets the public object search paths.
  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0),
      ),
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths).",
      );
    }
    return paths;
  }

  // Gets the private object directory.
  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' tool and set PRIVATE_OBJECT_DIR env var.",
      );
    }
    return ensureLeadingSlash(dir);
  }

  private async getBackend(): Promise<ObjectStorageBackend> {
    return this.backendPromise;
  }

  // Gets the upload URL for an object entity.
  async getObjectEntityUploadURL(): Promise<string> {
    const backend = await this.getBackend();
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = joinObjectPath(privateObjectDir, `uploads/${objectId}`);
    const { bucketName, objectName } = parseObjectPath(fullPath);
    return backend.getSignedUrl({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  // Gets the object entity file from the object path.
  async getObjectEntityFile(objectPath: string): Promise<ObjectFileHandle> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    const privateDir = this.getPrivateObjectDir();
    const objectEntityPath = joinObjectPath(privateDir, entityId);
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const backend = await this.getBackend();
    return backend.getFile(bucketName, objectName);
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("http://") && !rawPath.startsWith("https://")) {
      return rawPath;
    }

    let url: URL;
    try {
      url = new URL(rawPath);
    } catch {
      return rawPath;
    }

    const privateDir = ensureTrailingSlash(this.getPrivateObjectDir());
    let rawObjectPath = url.pathname;

    const bucketName = privateDir.split("/")[1];
    if (bucketName && !rawObjectPath.startsWith(`/${bucketName}/`)) {
      rawObjectPath = addLeadingSlash(`${bucketName}${rawObjectPath}`);
    }

    if (!rawObjectPath.startsWith(privateDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(privateDir.length);
    return `/objects/${entityId}`;
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const normalizedPath = ensureLeadingSlash(path);
  const pathParts = normalizedPath
    .split("/")
    .filter((part) => part.length > 0);
  if (pathParts.length < 2) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const [bucketName, ...objectParts] = pathParts;
  if (objectParts.length === 0) {
    throw new Error("Invalid path: must include an object name");
  }

  return {
    bucketName,
    objectName: objectParts.join("/"),
  };
}

async function signObjectUrlWithSidecar(options: SignedUrlOptions): Promise<string> {
  const request = {
    bucket_name: options.bucketName,
    object_name: options.objectName,
    method: options.method,
    expires_at: new Date(Date.now() + options.ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
    },
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, make sure you're running on Replit or provide fallback credentials.`,
    );
  }

  const { signed_url: signedURL } = await response.json();
  return signedURL;
}
