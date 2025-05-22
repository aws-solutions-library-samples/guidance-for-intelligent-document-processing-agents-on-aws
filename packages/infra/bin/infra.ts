import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { InfraStack } from "../lib/infra-stack";
import { AwsSolutionsChecks, NagPackSuppression, NagSuppressions } from "cdk-nag";


const app = new cdk.App();

const StackSuppressions: NagPackSuppression[] = [{
  id: "AwsSolutions-IAM5",
  reason: "Wild card in read only role as we block all other S3 operations than read. ",
},
{
  id: "AwsSolutions-S1",
  reason: "CloudTrail S3 resource doesn't need access logs.",
},
{
  id: "AwsSolutions-CB4",
  reason: "Disabling KMS usage for CodeBuild for as these are demos.",
},
{
  id: "AwsSolutions-KMS5",
  reason: "Key rotation disabled for codepipeline.",
},
]


const infraStack = new InfraStack(app, "AutoLoanAPP", {
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  // env: { account: account.number, region: account.region },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
  description: "SO9036"
});

cdk.Tags.of(infraStack).add("project", "auto-loan")

// Add CDK Nag for infra security
cdk.Aspects.of(app).add(new AwsSolutionsChecks());

/**
 * App wide NAG suppressions
 * Some of the resources used with in CDK constructs req
 */
NagSuppressions.addStackSuppressions(infraStack, StackSuppressions)

// synthesize the CDK package 
app.synth();
