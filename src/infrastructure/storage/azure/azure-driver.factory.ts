import type { Readable } from 'node:stream';
import type { ModuleResolver } from '../../optional-driver';
import { loadDriver } from '../../optional-driver';
import type {
  AzureBlobDriverPort,
  AzureBlobObject,
} from './azure-blob.storage';

interface AzureResponse {
  readonly readableStreamBody?: Readable;
  readonly contentLength?: number;
  readonly contentType?: string;
  readonly lastModified?: Date;
  readonly etag?: string;
}
interface BlobClient {
  uploadData(
    body: Buffer,
    options: Readonly<Record<string, unknown>>,
  ): Promise<AzureResponse>;
  download(): Promise<AzureResponse>;
  deleteIfExists(): Promise<{ readonly succeeded: boolean }>;
  exists(): Promise<boolean>;
  getProperties(): Promise<AzureResponse>;
  generateSasUrl(options: {
    readonly permissions: string;
    readonly expiresOn: Date;
  }): Promise<string>;
  url: string;
}
interface ContainerClient {
  getBlockBlobClient(key: string): BlobClient;
}
interface AzureModule {
  readonly BlobServiceClient: {
    fromConnectionString(value: string): {
      getContainerClient(container: string): ContainerClient;
    };
  };
}

export function createAzureBlobDriver(
  connectionString: string,
  container: string,
  resolver?: ModuleResolver,
): AzureBlobDriverPort {
  const azure = loadDriver<AzureModule>('@azure/storage-blob', resolver);
  const client =
    azure.BlobServiceClient.fromConnectionString(
      connectionString,
    ).getContainerClient(container);
  const blob = (key: string): BlobClient => client.getBlockBlobClient(key);
  return {
    upload: async (key, body, options) =>
      map(
        await blob(key).uploadData(body, {
          blobHTTPHeaders: { blobContentType: options.contentType },
          metadata: options.metadata,
        }),
      ),
    download: async (key) => map(await blob(key).download()),
    delete: async (key) => (await blob(key).deleteIfExists()).succeeded,
    exists: (key) => blob(key).exists(),
    properties: async (key) => map(await blob(key).getProperties()),
    signedUrl: (key, options) =>
      blob(key).generateSasUrl({
        permissions: (options.operation ?? 'get') === 'get' ? 'r' : 'cw',
        expiresOn: new Date(Date.now() + options.expiresInSeconds * 1000),
      }),
  };
}

function map(response: AzureResponse): AzureBlobObject {
  return {
    body: response.readableStreamBody,
    size: response.contentLength,
    contentType: response.contentType,
    lastModified: response.lastModified,
    checksum: response.etag,
  };
}
