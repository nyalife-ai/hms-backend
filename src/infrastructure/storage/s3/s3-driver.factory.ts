import type { ModuleResolver } from '../../optional-driver';
import { loadDriver } from '../../optional-driver';
import type { SignedUrlOptions } from '../../../platform/storage';
import type { S3DriverPort, S3Object } from './s3-compatible.storage';

interface AwsCommand {
  readonly input: Readonly<Record<string, unknown>>;
}
interface AwsModule {
  readonly S3Client: new (config: Readonly<Record<string, unknown>>) => {
    send(command: AwsCommand): Promise<Record<string, unknown>>;
  };
  readonly PutObjectCommand: new (
    input: Readonly<Record<string, unknown>>,
  ) => AwsCommand;
  readonly GetObjectCommand: new (
    input: Readonly<Record<string, unknown>>,
  ) => AwsCommand;
  readonly DeleteObjectCommand: new (
    input: Readonly<Record<string, unknown>>,
  ) => AwsCommand;
  readonly HeadObjectCommand: new (
    input: Readonly<Record<string, unknown>>,
  ) => AwsCommand;
}
interface AwsPresignerModule {
  getSignedUrl(
    client: object,
    command: AwsCommand,
    options: { readonly expiresIn: number },
  ): Promise<string>;
}

export interface S3DriverFactoryOptions {
  readonly region?: string;
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  readonly credentials?: {
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
}

export function createS3Driver(
  options: S3DriverFactoryOptions,
  resolver?: ModuleResolver,
): S3DriverPort {
  const aws = loadDriver<AwsModule>('@aws-sdk/client-s3', resolver);
  const presigner = loadDriver<AwsPresignerModule>(
    '@aws-sdk/s3-request-presigner',
    resolver,
  );
  const client = new aws.S3Client({ ...options });
  const command = (
    Command: new (input: Readonly<Record<string, unknown>>) => AwsCommand,
    bucket: string,
    key: string,
    extra: Readonly<Record<string, unknown>> = {},
  ): AwsCommand => new Command({ Bucket: bucket, Key: key, ...extra });
  return {
    putObject: async (input) => {
      const result = await client.send(
        command(aws.PutObjectCommand, input.bucket, input.key, {
          Body: input.body,
          ContentType: input.contentType,
          Metadata: input.metadata,
        }),
      );
      return mapS3Object(result);
    },
    getObject: async (bucket, key) =>
      mapS3Object(
        await client.send(command(aws.GetObjectCommand, bucket, key)),
      ),
    deleteObject: async (bucket, key) => {
      await client.send(command(aws.DeleteObjectCommand, bucket, key));
    },
    headObject: async (bucket, key) =>
      mapS3Object(
        await client.send(command(aws.HeadObjectCommand, bucket, key)),
      ),
    getSignedUrl: (bucket, key, signedOptions: SignedUrlOptions) =>
      presigner.getSignedUrl(
        client,
        command(
          (signedOptions.operation ?? 'get') === 'put'
            ? aws.PutObjectCommand
            : aws.GetObjectCommand,
          bucket,
          key,
        ),
        { expiresIn: signedOptions.expiresInSeconds },
      ),
  };
}

function mapS3Object(value: Readonly<Record<string, unknown>>): S3Object {
  return {
    body: value.Body as S3Object['body'],
    contentLength:
      typeof value.ContentLength === 'number' ? value.ContentLength : undefined,
    contentType:
      typeof value.ContentType === 'string' ? value.ContentType : undefined,
    lastModified:
      value.LastModified instanceof Date ? value.LastModified : undefined,
    checksum: typeof value.ETag === 'string' ? value.ETag : undefined,
  };
}
