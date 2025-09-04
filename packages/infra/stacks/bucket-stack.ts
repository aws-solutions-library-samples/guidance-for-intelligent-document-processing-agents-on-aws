import { Stack, RemovalPolicy, CfnOutput, StackProps, aws_s3_deployment as s3deploy } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
    BlockPublicAccess,
    Bucket,
    BucketEncryption,
    HttpMethods,
} from "aws-cdk-lib/aws-s3";
import { setSecureTransport } from "../constructs/cdk-helpers";
import { Key } from "aws-cdk-lib/aws-kms";

interface BucketStackProps extends StackProps {
    distributionDomainName: string;
    projectAccessLogsBucket: Bucket;
    kmsKey: Key;
}


export class BucketStack extends Stack {
    public readonly dataBucket: Bucket;
    constructor(scope: Construct, id: string, props: BucketStackProps) {
        super(scope, id, props);

        // content bucket with access to front end
        this.dataBucket = new Bucket(this, "data-bucket", {
            bucketName: `data-bucket-${this.account}-${this.region}`,
            blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
            encryption: BucketEncryption.KMS,
            encryptionKey: props.kmsKey,
            removalPolicy: RemovalPolicy.RETAIN,
            serverAccessLogsBucket: props.projectAccessLogsBucket,
            serverAccessLogsPrefix: "data-bucket",
            enforceSSL: true,
            cors: [
                {
                    allowedMethods: [HttpMethods.GET, HttpMethods.POST, HttpMethods.PUT, HttpMethods.HEAD, HttpMethods.DELETE],
                    allowedOrigins: ["http://localhost:3000", `https://${props.distributionDomainName}`],
                    allowedHeaders: ["*"],
                    exposedHeaders: ["x-amz-server-side-encryption",
                        "x-amz-request-id",
                        "x-amz-id-2",
                        "ETag",
                        "x-amz-meta-foo"],
                    maxAge: 3000,

                },
            ],
        });
        setSecureTransport(this.dataBucket);
        this.dataBucket.enableEventBridgeNotification()

        const prefixes = [
            'datasets/documents/',
            'applications/',
            'bda-result-raw/',
            'bda-result/'
        ];

        prefixes.forEach(prefix => {
            new s3deploy.BucketDeployment(this, `Deploy${prefix.replace('/', '')}`, {
                sources: [s3deploy.Source.data(`${prefix.replace('/', '')}.placeholder`, 'hello world')],
                destinationBucket: this.dataBucket,
                destinationKeyPrefix: prefix,
            });
        });

        // knowledge data bucket resource outputs
        new CfnOutput(this, "config-s3-data-bucket-name", {
            value: this.dataBucket.bucketName,
            description: "Data bucket name",
            exportName: `config-s3-data-bucket-name`,
        });
        // knowledge data bucket resource outputs
        new CfnOutput(this, "config-s3-data-bucket-arn", {
            value: this.dataBucket.bucketArn,
            description: "Data bucket ARN",
            exportName: `config-s3-data-bucket-arn`,
        });
    }
}